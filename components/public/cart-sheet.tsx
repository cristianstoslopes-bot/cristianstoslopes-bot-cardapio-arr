"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "@/contexts/cart-context";
import type { Restaurant } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { QuantityStepper } from "./quantity-stepper";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/** Barra flutuante + gaveta do carrinho (mobile-first, área de toque ≥ 44px). */
export function CartBar({ restaurant }: { restaurant: Restaurant }) {
  const { items, count, subtotalCents, hydrated, updateQuantity, removeItem } = useCart();
  const [open, setOpen] = useState(false);
  if (!hydrated || count === 0) return null;

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button size="lg" className="mx-auto flex h-14 w-full max-w-3xl justify-between rounded-2xl text-base shadow-xl" onClick={() => setOpen(true)}>
          <span className="flex items-center gap-2">
            <ShoppingBag aria-hidden /> Ver carrinho
            <span className="rounded-full bg-primary-foreground/20 px-2 text-sm">{count}</span>
          </span>
          <span>{formatCurrency(subtotalCents, restaurant.currency)}</span>
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-2xl">
          <SheetHeader>
            <SheetTitle className="font-display text-2xl">Seu pedido</SheetTitle>
            <SheetDescription>{restaurant.name}</SheetDescription>
          </SheetHeader>
          <ul className="grid max-h-[55dvh] gap-3 overflow-y-auto px-5">
            {items.map((i) => (
              <li key={i.lineId} className="flex items-start gap-3 border-b pb-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{i.name}</p>
                  {i.addonLabels.length > 0 && <p className="text-xs text-muted-foreground">+ {i.addonLabels.join(", ")}</p>}
                  {i.notes && <p className="text-xs italic text-muted-foreground">“{i.notes}”</p>}
                  <p className="mt-1 text-sm font-semibold">{formatCurrency((i.unitPriceCents + i.addonsTotalCents) * i.quantity, restaurant.currency)}</p>
                </div>
                <QuantityStepper value={i.quantity} min={1} onChange={(q) => updateQuantity(i.lineId, q)} label={`Quantidade de ${i.name}`} />
                <Button variant="ghost" size="icon" className="size-11" onClick={() => removeItem(i.lineId)} aria-label={`Remover ${i.name}`}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          <div className="grid gap-3 border-t p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="flex justify-between text-lg font-bold">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotalCents, restaurant.currency)}</span>
            </div>
            <Button asChild size="lg" className="h-14 text-base">
              <Link href={`/r/${restaurant.slug}/checkout`}>Finalizar pedido</Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
