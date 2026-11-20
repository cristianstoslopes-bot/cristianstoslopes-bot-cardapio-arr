"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Box, Search, UtensilsCrossed } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import { createClient } from "@/lib/supabase/client";
import { getSessionId, track } from "@/lib/analytics";
import type { Category, Product, Restaurant } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";
import { ProductSheet } from "./product-sheet";
import { CartBar } from "./cart-sheet";
import { Badge } from "@/components/ui/badge";

export function PublicMenu({
  restaurant, categories, products, table,
}: {
  restaurant: Restaurant;
  categories: Category[];
  products: Product[];
  table?: { id: string; label: string } | null;
}) {
  const { setTableId, tableId } = useCart();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [activeCat, setActiveCat] = useState<string | null>(categories[0]?.id ?? null);
  const navRef = useRef<HTMLDivElement>(null);

  // Vincula a mesa do QR ao carrinho + métricas de entrada
  useEffect(() => {
    if (table) {
      setTableId(table.id);
      void createClient().rpc("register_qr_scan", { p_table_id: table.id, p_session_id: getSessionId() });
    }
    track("menu_view", { restaurantId: restaurant.id, tableId: table?.id });
  }, [table, restaurant.id, setTableId]);

  // Destaca a categoria visível (scroll-spy)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveCat(visible.target.id.replace("cat-", ""));
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    document.querySelectorAll("[data-category-section]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [query]);

  useEffect(() => {
    navRef.current?.querySelector(`[data-cat="${activeCat}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeCat]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? products.filter((p) => `${p.name} ${p.description ?? ""} ${p.tags.join(" ")}`.toLowerCase().includes(q)) : products;
  }, [products, query]);

  const sections = useMemo(() => {
    const featured = filtered.filter((p) => p.is_featured);
    const list = categories
      .map((c) => ({ id: c.id, name: c.name, items: filtered.filter((p) => p.category_id === c.id) }))
      .filter((s) => s.items.length);
    const orphan = filtered.filter((p) => !p.category_id || !categories.some((c) => c.id === p.category_id));
    if (orphan.length) list.push({ id: "outros", name: "Outros", items: orphan });
    return { featured: query ? [] : featured, list };
  }, [filtered, categories, query]);

  const openProduct = (p: Product) => {
    setSelected(p);
    track("product_view", { restaurantId: restaurant.id, productId: p.id, tableId });
  };

  return (
    <>
      <header className="relative">
        <div className="relative h-40 bg-primary sm:h-56">
          {restaurant.cover_url && (
            <Image src={restaurant.cover_url} alt="" fill priority sizes="100vw" className="object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </div>
        <div className="mx-auto -mt-10 flex max-w-3xl items-end gap-4 px-4">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl border-4 border-background bg-secondary shadow">
            {restaurant.logo_url ? (
              <Image src={restaurant.logo_url} alt={`Logo ${restaurant.name}`} fill sizes="80px" className="object-cover" />
            ) : (
              <UtensilsCrossed className="m-auto size-full p-5 text-primary" aria-hidden />
            )}
          </div>
          <div className="min-w-0 pb-1">
            <h1 className="truncate font-display text-2xl font-bold">{restaurant.name}</h1>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge variant={restaurant.is_open ? "success" : "destructive"}>{restaurant.is_open ? "Aberto" : "Fechado"}</Badge>
              {table && <Badge variant="accent">Mesa {table.label}</Badge>}
              {restaurant.accepts_delivery && restaurant.delivery_fee_cents > 0 && (
                <span className="text-muted-foreground">Entrega {formatCurrency(restaurant.delivery_fee_cents)}</span>
              )}
            </div>
          </div>
        </div>
        {restaurant.description && <p className="mx-auto mt-3 max-w-3xl px-4 text-sm text-muted-foreground">{restaurant.description}</p>}
      </header>

      <div className="sticky top-0 z-20 mt-4 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 pt-3">
          <label className="relative block">
            <span className="sr-only">Buscar no cardápio</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar pratos, bebidas…"
              className="h-11 w-full rounded-full border border-input bg-card pl-10 pr-4 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>
        {!query && (
          <nav ref={navRef} aria-label="Categorias" className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
            {sections.list.map((s) => (
              <a
                key={s.id}
                href={`#cat-${s.id}`}
                data-cat={s.id}
                aria-current={activeCat === s.id ? "true" : undefined}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  activeCat === s.id ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                )}
              >
                {s.name}
              </a>
            ))}
          </nav>
        )}
      </div>

      {!restaurant.is_open && (
        <p role="status" className="mx-auto mt-4 max-w-3xl rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          Estamos fechados no momento. Você pode ver o cardápio, mas pedidos estão pausados.
        </p>
      )}

      <main className="mx-auto grid max-w-3xl gap-8 px-4 py-6">
        {sections.featured.length > 0 && (
          <section aria-labelledby="featured-title">
            <h2 id="featured-title" className="mb-3 font-display text-xl font-bold">Destaques</h2>
            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
              {sections.featured.map((p) => (
                <button key={p.id} onClick={() => openProduct(p)} className="w-44 shrink-0 snap-start overflow-hidden rounded-2xl border bg-card text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="relative aspect-square bg-muted">
                    {p.image_url && <Image src={p.image_url} alt={p.name} fill sizes="176px" className="object-cover" />}
                    {p.model_3d_id && <ThreeDBadge />}
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-1 text-sm font-semibold">{p.name}</p>
                    <p className="text-sm font-bold text-accent">{formatCurrency(p.price_cents, restaurant.currency)}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {sections.list.map((s) => (
          <section key={s.id} id={`cat-${s.id}`} data-category-section aria-labelledby={`h-${s.id}`} className="scroll-mt-36">
            <h2 id={`h-${s.id}`} className="mb-3 font-display text-xl font-bold">{s.name}</h2>
            <ul className="grid gap-3">
              {s.items.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => openProduct(p)}
                    className="flex w-full gap-3 rounded-2xl border bg-card p-3 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{p.name}</p>
                      {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                      <p className="mt-2 flex items-baseline gap-2">
                        <span className="font-bold text-accent">{formatCurrency(p.price_cents, restaurant.currency)}</span>
                        {p.compare_at_price_cents && p.compare_at_price_cents > p.price_cents && (
                          <s className="text-xs text-muted-foreground">{formatCurrency(p.compare_at_price_cents, restaurant.currency)}</s>
                        )}
                      </p>
                    </div>
                    <div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:size-28">
                      {p.image_url && <Image src={p.image_url} alt={p.name} fill sizes="112px" className="object-cover" />}
                      {p.model_3d_id && <ThreeDBadge />}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {filtered.length === 0 && <p className="py-16 text-center text-muted-foreground">Nenhum item encontrado.</p>}
      </main>

      {selected && (
        <ProductSheet
          product={selected}
          restaurant={restaurant}
          open={!!selected}
          onOpenChange={(v) => !v && setSelected(null)}
        />
      )}
      <CartBar restaurant={restaurant} />
    </>
  );
}

function ThreeDBadge() {
  return (
    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground shadow">
      <Box className="size-3" aria-hidden /> 3D
      <span className="sr-only">Disponível em 3D e Realidade Aumentada</span>
    </span>
  );
}
