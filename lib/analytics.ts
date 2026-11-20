"use client";

import { createClient } from "@/lib/supabase/client";

export type AnalyticsEvent =
  | "menu_view"
  | "product_view"
  | "model_view_3d"
  | "ar_session_start"
  | "add_to_cart"
  | "checkout_start"
  | "qr_scan";

/** ID anônimo por aba — permite medir funil 3D/AR → pedido sem cookies de terceiros. */
export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem("cardapio_sid");
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem("cardapio_sid", id);
    }
    return id;
  } catch {
    return "";
  }
}

/** Fire-and-forget: nunca bloqueia a UI nem lança erro. */
export function track(
  event: AnalyticsEvent,
  data: { restaurantId: string; productId?: string; tableId?: string | null; metadata?: Record<string, unknown> },
) {
  const supabase = createClient();
  void supabase
    .from("analytics_events")
    .insert({
      restaurant_id: data.restaurantId,
      event_type: event,
      product_id: data.productId ?? null,
      table_id: data.tableId ?? null,
      session_id: getSessionId() || null,
      metadata: data.metadata ?? {},
    })
    .then(({ error }) => {
      if (error && process.env.NODE_ENV === "development") console.warn("[analytics]", error.message);
    });
}
