"use client";

/**
 * Pedidos em tempo real (Supabase Realtime / postgres_changes).
 *
 * - UM canal por painel (provider no DashboardShell) → todas as páginas recebem.
 * - Filtro `restaurant_id=eq.<id>` + RLS no servidor Realtime: mesmo que alguém
 *   altere o filtro no navegador, só recebe linhas que a policy de SELECT permite.
 * - INSERT → busca o pedido completo (com itens), toca som, mostra toast e
 *   Notification do sistema (se permitido), pisca o título da aba.
 * - UPDATE → aplica o diff na lista (outro atendente mudou o status).
 * - Reconexão: ao voltar para SUBSCRIBED, refaz o fetch para não perder eventos.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { playNewOrderSound } from "@/lib/notify-sound";
import { friendlyDbError } from "@/lib/utils";
import type { Order, OrderStatus } from "@/lib/types";

const ACTIVE: OrderStatus[] = ["pending", "accepted", "preparing", "ready", "out_for_delivery"];
const ORDER_SELECT = "*, order_items(*), table:tables(label)";

type ConnectionState = "connecting" | "live" | "offline";

interface RealtimeOrdersValue {
  orders: Order[];
  pendingCount: number;
  loading: boolean;
  connection: ConnectionState;
  updateStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  refetch: () => Promise<void>;
}

export function useRealtimeOrders(restaurantId: string, { notify = false } = {}): RealtimeOrdersValue {
  const supabase = createClient();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  const refetch = useCallback(async () => {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("restaurant_id", restaurantId)
      .in("status", ACTIVE)
      .gte("created_at", since)
      .order("created_at", { ascending: true });
    if (!error) setOrders((data ?? []) as Order[]);
    setLoading(false);
  }, [supabase, restaurantId]);

  useEffect(() => {
    // Sincroniza com sistema externo (Supabase): fetch inicial + assinatura Realtime.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch();

    const handleInsert = async (payload: RealtimePostgresChangesPayload<Order>) => {
      const id = (payload.new as Order).id;
      const { data } = await supabase.from("orders").select(ORDER_SELECT).eq("id", id).single();
      if (!data) return;
      const order = data as Order;
      setOrders((prev) => (prev.some((o) => o.id === id) ? prev : [...prev, order]));
      if (notifyRef.current) {
        playNewOrderSound();
        toast.success(`Novo pedido #${order.number}`, {
          description: `${order.customer_name} · ${(order.total_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`,
          duration: 10000,
        });
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
          new Notification(`Novo pedido #${order.number}`, { body: order.customer_name, tag: order.id });
        }
      }
    };

    const handleUpdate = (payload: RealtimePostgresChangesPayload<Order>) => {
      const updated = payload.new as Order;
      setOrders((prev) => {
        if (!ACTIVE.includes(updated.status)) return prev.filter((o) => o.id !== updated.id);
        return prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o));
      });
    };

    const channel = supabase
      .channel(`orders:${restaurantId}:${crypto.randomUUID()}`)
      .on<Order>("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, handleInsert)
      .on<Order>("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, handleUpdate)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnection((prev) => {
            if (prev === "offline") void refetch(); // recupera eventos perdidos durante a queda
            return "live";
          });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnection("offline");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, restaurantId, refetch]);

  const pendingCount = useMemo(() => orders.filter((o) => o.status === "pending").length, [orders]);

  // Título da aba pisca com a contagem de pedidos novos
  useEffect(() => {
    if (!notify) return;
    const base = document.title.replace(/^\(\d+\) /, "");
    document.title = pendingCount > 0 ? `(${pendingCount}) ${base}` : base;
  }, [pendingCount, notify]);

  const updateStatus = useCallback(
    async (orderId: string, status: OrderStatus) => {
      const previous = orders;
      // Otimista: a UI responde na hora; reverte se o banco recusar (ex.: transição inválida)
      setOrders((prev) =>
        ACTIVE.includes(status) ? prev.map((o) => (o.id === orderId ? { ...o, status } : o)) : prev.filter((o) => o.id !== orderId),
      );
      const { error } = await supabase.from("orders").update({ status }).eq("id", orderId).eq("restaurant_id", restaurantId);
      if (error) {
        setOrders(previous);
        toast.error(friendlyDbError(error.message));
      }
    },
    [orders, supabase, restaurantId],
  );

  return { orders, pendingCount, loading, connection, updateStatus, refetch };
}

const OrdersRealtimeContext = createContext<RealtimeOrdersValue | null>(null);

export function OrdersRealtimeProvider({ restaurantId, children }: { restaurantId: string; children: React.ReactNode }) {
  const value = useRealtimeOrders(restaurantId, { notify: true });
  return <OrdersRealtimeContext.Provider value={value}>{children}</OrdersRealtimeContext.Provider>;
}

export function useOrdersRealtime() {
  const ctx = useContext(OrdersRealtimeContext);
  if (!ctx) throw new Error("useOrdersRealtime deve ser usado dentro de <OrdersRealtimeProvider>");
  return ctx;
}
