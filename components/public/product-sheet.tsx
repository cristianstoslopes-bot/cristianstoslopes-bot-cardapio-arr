"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Box, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import {
  computeAddons,
  useCart,
  type CartAddonSelection,
} from "@/contexts/cart-context";
import { track } from "@/lib/analytics";
import type { Product, Restaurant } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";
import { ProductViewer } from "@/components/ar/product-viewer";
import { QuantityStepper } from "./quantity-stepper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

export function ProductSheet({
  product,
  restaurant,
  open,
  onOpenChange,
}: {
  product: Product;
  restaurant: Restaurant;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { addItem, tableId } = useCart();
  const has3D = !!product.model_3d;
  // 3D só monta quando o cliente pede (lazy) — imagem é o padrão leve.
  const [view, setView] = useState<"photo" | "3d">(
    has3D && !product.image_url ? "3d" : "photo",
  );
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [selection, setSelection] = useState<Record<string, string[]>>({});

  const groups = useMemo(
    () => product.addon_groups ?? [],
    [product.addon_groups],
  );
  const addons: CartAddonSelection[] = useMemo(
    () =>
      Object.entries(selection).map(([group_id, option_ids]) => ({
        group_id,
        option_ids,
      })),
    [selection],
  );
  const { total: addonsTotal } = useMemo(
    () => computeAddons(groups, addons),
    [groups, addons],
  );
  const unmet = groups.filter((g) => (selection[g.id]?.length ?? 0) < g.min);
  const total = (product.price_cents + addonsTotal) * quantity;

  const toggleOption = (groupId: string, optionId: string, max: number) => {
    setSelection((prev) => {
      const current = prev[groupId] ?? [];
      if (max === 1) return { ...prev, [groupId]: [optionId] };
      if (current.includes(optionId))
        return { ...prev, [groupId]: current.filter((x) => x !== optionId) };
      if (current.length >= max) return prev;
      return { ...prev, [groupId]: [...current, optionId] };
    });
  };

  const add = () => {
    if (unmet.length)
      return toast.error(`Escolha: ${unmet.map((g) => g.name).join(", ")}`);
    addItem(product, {
      quantity,
      addons: addons.filter((a) => a.option_ids.length),
      notes: notes.trim() || undefined,
    });
    track("add_to_cart", {
      restaurantId: restaurant.id,
      productId: product.id,
      tableId,
      metadata: { from: view },
    });
    toast.success(`${product.name} adicionado`);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-w-2xl gap-0 overflow-y-auto p-0"
      >
        <div className="relative">
          {view === "3d" && product.model_3d ? (
            <div className="p-3 pb-0">
              <ProductViewer
                model={product.model_3d}
                product={product}
                restaurantId={restaurant.id}
                tableId={tableId}
                currency={restaurant.currency}
                onAddToCart={add}
                showAddButton={false}
              />
            </div>
          ) : (
            <div className="relative aspect-[4/3] w-full bg-muted sm:aspect-video">
              {product.image_url && (
                <Image
                  src={product.image_url}
                  alt={product.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 672px"
                  className="object-cover"
                />
              )}
            </div>
          )}
        </div>
        {has3D && (
          <div
            className="mx-auto mt-3 flex w-fit rounded-full bg-muted p-1"
            role="tablist"
            aria-label="Modo de visualização"
          >
            {product.image_url && (
              <button
                role="tab"
                aria-selected={view === "photo"}
                onClick={() => setView("photo")}
                className={cn(
                  "flex items-center gap-1 rounded-full px-3 py-2 text-sm font-medium",
                  view === "photo" && "bg-primary text-primary-foreground",
                )}
              >
                <ImageIcon className="size-4" aria-hidden /> Foto
              </button>
            )}
            <button
              role="tab"
              aria-selected={view === "3d"}
              onClick={() => setView("3d")}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold",
                view === "3d"
                  ? "bg-primary text-primary-foreground"
                  : "text-accent",
              )}
            >
              <Box className="size-4" aria-hidden /> Ver em 3D / AR
            </button>
          </div>
        )}

        <div className="grid gap-5 p-5">
          <div>
            <SheetTitle className="font-display text-2xl">
              {product.name}
            </SheetTitle>
            <SheetDescription className="mt-1 text-base">
              {product.description}
            </SheetDescription>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xl font-bold text-accent">
                {formatCurrency(product.price_cents, restaurant.currency)}
              </span>
              {product.prep_time_minutes && (
                <Badge variant="outline">
                  ~{product.prep_time_minutes} min
                </Badge>
              )}
              {product.calories && (
                <Badge variant="outline">{product.calories} kcal</Badge>
              )}
              {product.tags.map((t) => (
                <Badge key={t} variant="secondary">
                  {t}
                </Badge>
              ))}
            </div>
            {product.allergens.length > 0 && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                ⚠️ Contém: {product.allergens.join(", ")}
              </p>
            )}
          </div>

          {groups.map((g) => {
            const chosen = selection[g.id] ?? [];
            const single = g.max === 1;
            return (
              <fieldset key={g.id} className="grid gap-2">
                <legend className="mb-2 flex w-full items-center justify-between">
                  <span className="font-semibold">{g.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {g.min > 0 ? (
                      <Badge
                        variant={chosen.length >= g.min ? "success" : "warning"}
                      >
                        Obrigatório
                      </Badge>
                    ) : (
                      `até ${g.max}`
                    )}
                  </span>
                </legend>
                {g.options.map((o) => {
                  const checked = chosen.includes(o.id);
                  const disabled =
                    !checked && !single && chosen.length >= g.max;
                  return (
                    <label
                      key={o.id}
                      className={cn(
                        "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                        checked && "border-primary bg-primary/5",
                        disabled && "opacity-50",
                      )}
                    >
                      <input
                        type={single ? "radio" : "checkbox"}
                        name={`g-${g.id}`}
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleOption(g.id, o.id, g.max)}
                        className="size-5 accent-[var(--primary)]"
                      />
                      <span className="flex-1">{o.name}</span>
                      {o.price_cents > 0 && (
                        <span className="text-sm text-muted-foreground">
                          +{formatCurrency(o.price_cents, restaurant.currency)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </fieldset>
            );
          })}

          <div className="grid gap-1.5">
            <label htmlFor="item-notes" className="text-sm font-semibold">
              Observações
            </label>
            <Textarea
              id="item-notes"
              rows={2}
              maxLength={200}
              placeholder="Ex.: sem cebola, ponto da carne…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center gap-3 border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            label="Quantidade"
          />
          <Button
            size="lg"
            className="h-12 flex-1 justify-between text-base"
            onClick={add}
            disabled={!restaurant.is_open}
          >
            <span>{restaurant.is_open ? "Adicionar" : "Fechado"}</span>
            <span>{formatCurrency(total, restaurant.currency)}</span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
