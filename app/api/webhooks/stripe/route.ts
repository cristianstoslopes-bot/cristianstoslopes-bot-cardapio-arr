import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/payments/stripe";

/**
 * Webhook Stripe → fonte da verdade de assinaturas e pagamentos de pedidos.
 * Usa service role (ignora RLS) — por isso a assinatura do evento é SEMPRE validada.
 * Eventos: checkout.session.completed, customer.subscription.updated|deleted, invoice.payment_failed
 */
const STATUS_MAP: Record<string, "trialing" | "active" | "past_due" | "canceled"> = {
  trialing: "trialing", active: "active", past_due: "past_due", unpaid: "past_due",
  canceled: "canceled", incomplete: "past_due", incomplete_expired: "canceled", paused: "canceled",
};

async function upsertSubscription(sub: Stripe.Subscription) {
  const restaurantId = sub.metadata.restaurant_id;
  const planId = sub.metadata.plan_id;
  if (!restaurantId || !planId) return;
  const periodEnd = sub.items.data[0]?.current_period_end;
  await createAdminClient()
    .from("subscriptions")
    .upsert(
      {
        restaurant_id: restaurantId,
        plan_id: planId,
        status: STATUS_MAP[sub.status] ?? "past_due",
        provider: "stripe",
        provider_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
        provider_subscription_id: sub.id,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: sub.cancel_at_period_end,
      },
      { onConflict: "restaurant_id" },
    );
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const admin = createAdminClient();
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.metadata?.kind === "order" && session.payment_status === "paid") {
        const { data: order } = await admin.from("orders").select("total_cents").eq("id", session.metadata.order_id).maybeSingle();
        if (order && session.amount_total === order.total_cents && session.currency === "brl") {
          await admin.from("orders").update({ payment_status: "paid" }).eq("id", session.metadata.order_id).eq("payment_status", "pending");
        }
      }
      if (session.mode === "subscription" && session.subscription) {
        const sub = await stripe().subscriptions.retrieve(typeof session.subscription === "string" ? session.subscription : session.subscription.id);
        await upsertSubscription(sub);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await upsertSubscription(event.data.object);
      break;
    case "checkout.session.expired": {
      const session = event.data.object;
      if (session.metadata?.kind === "order") {
        await admin.from("orders").update({ payment_status: "failed" }).eq("id", session.metadata.order_id).eq("payment_status", "pending");
      }
      break;
    }
  }
  return NextResponse.json({ received: true });
}
