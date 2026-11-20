"use client";

/**
 * Acompanhamento do pedido pelo cliente (sem login), via token secreto.
 * Polling leve (5s, pausa com a aba oculta) na RPC `get_order_by_token`.
 * Obs.: o cliente anônimo não tem SELECT em `orders` (RLS), por isso não usa
 * postgres_changes aqui — o painel do restaurante é que usa Realtime.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Loader2, MessageCircle, Star } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ORDER_STATUS_LABEL, type OrderStatus, type OrderType } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface TrackedOrder {
  id: string; number: number; status: OrderStatus; type: OrderType;
  payment_method: string; payment_status: string; total_cents: number; subtotal_cents: number;
  discount_cents: number; delivery_fee_cents: number; customer_name: string; created_at: string;
  has_review: boolean;
  restaurant: { name: string; slug: string; whatsapp: string | null };
  items: { product_name: string; quantity: number; total_cents: number; addons: { name: string }[] }[];
}

const FLOW: Record<OrderType, OrderStatus[]> = {
  delivery: ["pending", "accepted", "preparing", "ready", "out_for_delivery", "delivered"],
  pickup: ["pending", "accepted", "preparing", "ready", "delivered"],
  dine_in: ["pending", "accepted", "preparing", "ready", "delivered"],
};

export function OrderTracker({ token, paymentReturn }: { token: string; paymentReturn?: string }) {
  const supabase = createClient();
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("get_order_by_token", { p_token: token });
    if (!data) setNotFound(true);
    else setOrder(data as TrackedOrder);
  }, [supabase, token]);

  useEffect(() => {
    // Polling do status no Supabase (sistema externo)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    if (paymentReturn === "success") toast.success("Pagamento recebido! Confirmando…");
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => clearInterval(id);
  }, [load, paymentReturn]);

  if (notFound) return <p className="p-8 text-center">Pedido não encontrado.</p>;
  if (!order) return <Loader2 className="mx-auto mt-20 size-8 animate-spin" />;

  const flow = FLOW[order.type];
  const currentIdx = flow.indexOf(order.status);
  const cancelled = order.status === "cancelled";

  const pay = async () => {
    const res = await fetch("/api/orders/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const json = (await res.json()) as { url?: string; error?: string };
    if (json.url) window.location.assign(json.url);
    else toast.error(json.error ?? "Pagamento indisponível");
  };

  return (
    <main className="mx-auto grid max-w-lg gap-6 p-4">
      <div className="text-center">
        <p className="text-sm text-muted-foreground">{order.restaurant.name}</p>
        <h1 className="font-display text-3xl font-bold">Pedido #{String(order.number).padStart(4, "0")}</h1>
        <p className="mt-1 text-sm" role="status" aria-live="polite">
          {cancelled ? "Pedido cancelado pelo restaurante." : `Status: ${ORDER_STATUS_LABEL[order.status]}`}
        </p>
      </div>

      {!cancelled && (
        <ol className="grid gap-0" aria-label="Etapas do pedido">
          {flow.map((s, i) => {
            const done = i <= currentIdx;
            return (
              <li key={s} className="flex items-center gap-3 py-2" aria-current={i === currentIdx ? "step" : undefined}>
                <span className={cn("grid size-8 place-items-center rounded-full border-2 text-sm font-bold", done ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground", i === currentIdx && "motion-safe:animate-pulse")}>
                  {done ? <Check className="size-4" /> : i + 1}
                </span>
                <span className={cn("text-sm", done ? "font-semibold" : "text-muted-foreground")}>{ORDER_STATUS_LABEL[s]}</span>
              </li>
            );
          })}
        </ol>
      )}

      {order.payment_method === "online" && order.payment_status !== "paid" && !cancelled && (
        <Button size="lg" variant="accent" onClick={pay}>Pagar agora · {formatCurrency(order.total_cents)}</Button>
      )}
      {order.payment_status === "paid" && <p className="rounded-lg bg-emerald-50 p-3 text-center text-sm text-emerald-800">✔ Pagamento confirmado</p>}

      <section className="grid gap-2 rounded-2xl bg-muted p-4 text-sm" aria-label="Itens">
        {order.items.map((i, idx) => (
          <div key={idx} className="flex justify-between gap-2">
            <span>{i.quantity}× {i.product_name}{i.addons?.length ? <span className="text-muted-foreground"> (+{i.addons.map((a) => a.name).join(", ")})</span> : null}</span>
            <span>{formatCurrency(i.total_cents)}</span>
          </div>
        ))}
        <hr />
        {order.discount_cents > 0 && <div className="flex justify-between"><span>Desconto</span><span>−{formatCurrency(order.discount_cents)}</span></div>}
        {order.delivery_fee_cents > 0 && <div className="flex justify-between"><span>Entrega</span><span>{formatCurrency(order.delivery_fee_cents)}</span></div>}
        <div className="flex justify-between font-bold"><span>Total</span><span>{formatCurrency(order.total_cents)}</span></div>
      </section>

      {order.status === "delivered" && !order.has_review && <ReviewForm token={token} onDone={load} />}

      <div className="grid gap-2">
        {order.restaurant.whatsapp && (
          <Button asChild variant="outline" size="lg">
            <a href={`https://wa.me/55${order.restaurant.whatsapp}?text=${encodeURIComponent(`Olá! Sobre o pedido #${order.number}`)}`} target="_blank" rel="noreferrer">
              <MessageCircle /> Falar com o restaurante
            </a>
          </Button>
        )}
        <Button asChild variant="ghost"><Link href={`/r/${order.restaurant.slug}`}>Voltar ao cardápio</Link></Button>
      </div>
    </main>
  );
}

function ReviewForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!rating) return toast.error("Escolha uma nota");
    setSending(true);
    const { error } = await createClient().rpc("submit_review", { p_token: token, p_rating: rating, p_comment: comment });
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success("Obrigado pela avaliação!");
    onDone();
  };

  return (
    <fieldset className="grid gap-3 rounded-2xl border p-4">
      <legend className="px-1 font-semibold">Como foi seu pedido?</legend>
      <div className="flex justify-center gap-1" role="radiogroup" aria-label="Nota de 1 a 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} estrela${n > 1 ? "s" : ""}`} onClick={() => setRating(n)} className="p-1">
            <Star className={cn("size-9", n <= rating ? "fill-accent text-accent" : "text-muted-foreground")} />
          </button>
        ))}
      </div>
      <Textarea aria-label="Comentário" placeholder="Conte o que achou (opcional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
      <Button onClick={submit} disabled={sending}>{sending && <Loader2 className="animate-spin" />}Enviar avaliação</Button>
    </fieldset>
  );
}
