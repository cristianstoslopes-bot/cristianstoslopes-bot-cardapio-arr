"use client";

/**
 * Painel de Cozinha/Atendimento (KDS). Colunas por status, atualizadas via Realtime.
 * Botões grandes (touch em tablet na cozinha) e atalhos de teclado:
 *   Tab/Shift+Tab percorre os cards; Enter no botão avança o status.
 */
import { useEffect, useState } from "react";
import { BellRing, Bike, CheckCircle2, ChefHat, Clock, Loader2, Store, UtensilsCrossed, Volume2, Wifi, WifiOff, XCircle } from "lucide-react";
import { useOrdersRealtime } from "@/hooks/use-realtime-orders";
import { isAudioUnlocked, playNewOrderSound, unlockAudio } from "@/lib/notify-sound";
import { PAYMENT_METHOD_LABEL, type Order, type OrderStatus } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const COLUMNS: { status: OrderStatus[]; title: string; tone: string }[] = [
  { status: ["pending"], title: "Novos", tone: "border-t-brand-caramel" },
  { status: ["accepted", "preparing"], title: "Em preparo", tone: "border-t-amber-500" },
  { status: ["ready", "out_for_delivery"], title: "Prontos / Em rota", tone: "border-t-emerald-600" },
];

function nextAction(order: Order): { label: string; status: OrderStatus; icon: React.ElementType } | null {
  switch (order.status) {
    case "pending": return { label: "Aceitar", status: "accepted", icon: CheckCircle2 };
    case "accepted": return { label: "Iniciar preparo", status: "preparing", icon: ChefHat };
    case "preparing": return { label: "Marcar pronto", status: "ready", icon: BellRing };
    case "ready":
      return order.type === "delivery"
        ? { label: "Saiu p/ entrega", status: "out_for_delivery", icon: Bike }
        : { label: "Entregue", status: "delivered", icon: CheckCircle2 };
    case "out_for_delivery": return { label: "Entregue", status: "delivered", icon: CheckCircle2 };
    default: return null;
  }
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const min = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000));
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", min >= 25 ? "font-bold text-destructive" : "text-muted-foreground")}>
      <Clock className="size-3" aria-hidden /> {min} min
    </span>
  );
}

function OrderCard({ order, onAdvance, onCancel }: { order: Order; onAdvance: (s: OrderStatus) => Promise<void>; onCancel: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const action = nextAction(order);
  const TypeIcon = order.type === "delivery" ? Bike : order.type === "dine_in" ? UtensilsCrossed : Store;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <article
      aria-label={`Pedido ${order.number} de ${order.customer_name}`}
      className={cn("rounded-xl border bg-card p-4 shadow-sm", order.status === "pending" && "ring-2 ring-brand-caramel motion-safe:animate-pulse")}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-lg font-bold">#{String(order.number).padStart(4, "0")}</p>
          <p className="text-sm font-medium">{order.customer_name}</p>
        </div>
        <div className="grid justify-items-end gap-1">
          <Badge variant="secondary">
            <TypeIcon className="size-3" aria-hidden />
            {order.type === "dine_in" ? `Mesa ${order.table?.label ?? ""}` : order.type === "delivery" ? "Delivery" : "Retirada"}
          </Badge>
          <Elapsed since={order.created_at} />
        </div>
      </header>

      <ul className="my-3 grid gap-1.5 border-y py-3 text-sm">
        {order.order_items?.map((item) => (
          <li key={item.id}>
            <span className="font-semibold">{item.quantity}×</span> {item.product_name}
            {item.addons?.length > 0 && <p className="pl-5 text-xs text-muted-foreground">+ {item.addons.map((a) => a.name).join(", ")}</p>}
            {item.notes && <p className="pl-5 text-xs font-medium text-amber-700">Obs: {item.notes}</p>}
          </li>
        ))}
      </ul>

      {order.notes && <p className="mb-2 rounded bg-amber-50 p-2 text-xs text-amber-900">📝 {order.notes}</p>}
      {order.type === "delivery" && order.delivery_address && (
        <p className="mb-2 text-xs text-muted-foreground">
          📍 {order.delivery_address.street}, {order.delivery_address.number} — {order.delivery_address.district}
        </p>
      )}

      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{PAYMENT_METHOD_LABEL[order.payment_method]}</span>
        <span className="font-bold">{formatCurrency(order.total_cents)}</span>
      </div>

      <div className="flex gap-2">
        {action && (
          <Button className="h-12 flex-1 text-base" disabled={busy} onClick={() => run(() => onAdvance(action.status))}>
            {busy ? <Loader2 className="animate-spin" /> : <action.icon />}
            {action.label}
          </Button>
        )}
        {["pending", "accepted", "preparing"].includes(order.status) && (
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-12"
            disabled={busy}
            aria-label={`Cancelar pedido ${order.number}`}
            onClick={() => {
              if (confirm(`Cancelar o pedido #${order.number}?`)) void run(onCancel);
            }}
          >
            <XCircle />
          </Button>
        )}
      </div>
    </article>
  );
}

export function KitchenBoard() {
  const { orders, loading, connection, updateStatus } = useOrdersRealtime();
  // AudioContext é global ao módulo: se já foi liberado em outra página, mantém o estado
  const [soundOn, setSoundOn] = useState(() => isAudioUnlocked());

  const enableAlerts = async () => {
    unlockAudio();
    playNewOrderSound();
    setSoundOn(true);
    if (typeof Notification !== "undefined" && Notification.permission === "default") await Notification.requestPermission();
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Pedidos</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground" role="status" aria-live="polite">
            {connection === "live" ? (
              <><Wifi className="size-4 text-emerald-600" aria-hidden /> Tempo real conectado</>
            ) : connection === "offline" ? (
              <><WifiOff className="size-4 text-destructive" aria-hidden /> Reconectando…</>
            ) : (
              <><Loader2 className="size-4 animate-spin" aria-hidden /> Conectando…</>
            )}
          </p>
        </div>
        <Button variant={soundOn ? "outline" : "accent"} onClick={enableAlerts}>
          <Volume2 /> {soundOn ? "Testar alerta sonoro" : "Ativar som e notificações"}
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="size-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => {
            const list = orders.filter((o) => col.status.includes(o.status));
            return (
              <section key={col.title} aria-label={col.title} className={cn("rounded-2xl border-t-4 bg-muted/60 p-3", col.tone)}>
                <h2 className="mb-3 flex items-center justify-between px-1 font-semibold">
                  {col.title} <Badge variant="outline">{list.length}</Badge>
                </h2>
                <div className="grid gap-3">
                  {list.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum pedido</p>}
                  {list.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      onAdvance={(s) => updateStatus(o.id, s)}
                      onCancel={() => updateStatus(o.id, "cancelled")}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <p className="sr-only" aria-live="assertive">
        {orders.filter((o) => o.status === "pending").length} pedidos aguardando aceite
      </p>
    </div>
  );
}
