"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AddonGroup, Product } from "@/lib/types";

/**
 * Carrinho do cardápio público.
 * - Estado local + persistência em localStorage por restaurante (sobrevive a refresh).
 * - Guarda preços apenas para EXIBIÇÃO; o total real é recalculado em `place_order` (SQL).
 */
export interface CartAddonSelection {
  group_id: string;
  option_ids: string[];
}

export interface CartItem {
  lineId: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  unitPriceCents: number;
  addonsTotalCents: number;
  addonLabels: string[];
  addons: CartAddonSelection[];
  quantity: number;
  notes?: string;
}

interface CartContextValue {
  items: CartItem[];
  tableId: string | null;
  count: number;
  subtotalCents: number;
  hydrated: boolean;
  addItem: (product: Product, opts: { quantity: number; addons: CartAddonSelection[]; notes?: string }) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  clear: () => void;
  setTableId: (id: string | null) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function computeAddons(groups: AddonGroup[], selection: CartAddonSelection[]) {
  let total = 0;
  const labels: string[] = [];
  for (const sel of selection) {
    const group = groups.find((g) => g.id === sel.group_id);
    for (const optId of sel.option_ids) {
      const opt = group?.options.find((o) => o.id === optId);
      if (opt) {
        total += opt.price_cents;
        labels.push(opt.name);
      }
    }
  }
  return { total, labels };
}

export function CartProvider({ restaurantId, children }: { restaurantId: string; children: React.ReactNode }) {
  const storageKey = `cart:${restaurantId}`;
  const [items, setItems] = useState<CartItem[]>([]);
  const [tableId, setTableId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hidrata do localStorage após montar (evita mismatch SSR). localStorage é um
  // sistema externo; ler no useState inicial causaria divergência servidor/cliente.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { items: CartItem[]; tableId: string | null; savedAt: number };
        // Carrinho expira em 12h
        if (Date.now() - parsed.savedAt < 12 * 3600_000) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setItems(parsed.items ?? []);
          setTableId((t) => t ?? parsed.tableId ?? null);
        }
      }
    } catch {
      /* storage indisponível (aba privada): segue só em memória */
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ items, tableId, savedAt: Date.now() }));
    } catch {
      /* ignore */
    }
  }, [items, tableId, hydrated, storageKey]);

  const addItem = useCallback<CartContextValue["addItem"]>((product, { quantity, addons, notes }) => {
    const { total, labels } = computeAddons(product.addon_groups ?? [], addons);
    // Mesmo produto + mesmos adicionais + mesma observação → soma quantidade
    const signature = JSON.stringify([product.id, addons, notes ?? ""]);
    setItems((prev) => {
      const existing = prev.find((i) => JSON.stringify([i.productId, i.addons, i.notes ?? ""]) === signature);
      if (existing) {
        return prev.map((i) => (i.lineId === existing.lineId ? { ...i, quantity: Math.min(99, i.quantity + quantity) } : i));
      }
      return [
        ...prev,
        {
          lineId: crypto.randomUUID(),
          productId: product.id,
          name: product.name,
          imageUrl: product.image_url,
          unitPriceCents: product.price_cents,
          addonsTotalCents: total,
          addonLabels: labels,
          addons,
          quantity,
          notes,
        },
      ];
    });
  }, []);

  const updateQuantity = useCallback((lineId: string, quantity: number) => {
    setItems((prev) =>
      quantity <= 0 ? prev.filter((i) => i.lineId !== lineId) : prev.map((i) => (i.lineId === lineId ? { ...i, quantity: Math.min(99, quantity) } : i)),
    );
  }, []);

  const removeItem = useCallback((lineId: string) => setItems((prev) => prev.filter((i) => i.lineId !== lineId)), []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartContextValue>(() => {
    const subtotalCents = items.reduce((s, i) => s + (i.unitPriceCents + i.addonsTotalCents) * i.quantity, 0);
    const count = items.reduce((s, i) => s + i.quantity, 0);
    return { items, tableId, count, subtotalCents, hydrated, addItem, updateQuantity, removeItem, clear, setTableId };
  }, [items, tableId, hydrated, addItem, updateQuantity, removeItem, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart deve ser usado dentro de <CartProvider>");
  return ctx;
}
