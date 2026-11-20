import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mp, verifyMercadoPagoSignature } from "@/lib/payments/mercadopago";

/**
 * Webhook Mercado Pago. A notificação só traz o ID: buscamos o recurso na API
 * (nunca confiamos no corpo) e validamos x-signature com o segredo do painel MP.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { type?: string; data?: { id?: string } };
  const dataId = body.data?.id ?? req.nextUrl.searchParams.get("data.id") ?? "";
  if (!dataId || !verifyMercadoPagoSignature(req.headers, dataId)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const admin = createAdminClient();

  if (body.type === "payment") {
    const payment = await mp<{ status: string; external_reference: string }>(`/v1/payments/${dataId}`);
    const status = payment.status === "approved" ? "paid" : payment.status === "rejected" || payment.status === "cancelled" ? "failed" : payment.status === "refunded" ? "refunded" : null;
    if (status && payment.external_reference) {
      await admin.from("orders").update({ payment_status: status }).eq("id", payment.external_reference);
    }
  }

  if (body.type === "subscription_preapproval" || body.type === "preapproval") {
    const pre = await mp<{ id: string; status: string; external_reference: string; next_payment_date?: string; payer_id?: number }>(`/preapproval/${dataId}`);
    const [restaurantId, planId] = (pre.external_reference ?? "").split(":");
    if (restaurantId && planId) {
      const status = pre.status === "authorized" ? "active" : pre.status === "paused" ? "past_due" : pre.status === "cancelled" ? "canceled" : null;
      if (status) {
        await admin.from("subscriptions").upsert(
          {
            restaurant_id: restaurantId, plan_id: planId, status, provider: "mercadopago",
            provider_subscription_id: pre.id, provider_customer_id: pre.payer_id ? String(pre.payer_id) : null,
            current_period_end: pre.next_payment_date ?? null,
          },
          { onConflict: "restaurant_id" },
        );
      }
    }
  }

  return NextResponse.json({ received: true });
}
