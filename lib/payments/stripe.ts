import "server-only";
import Stripe from "stripe";
import type { PaymentProvider } from "./types";

let client: Stripe | null = null;
export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY não configurada");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",

  async createSubscriptionCheckout({ restaurantId, plan, customerEmail, successUrl, cancelUrl }) {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer_email: customerEmail,
      client_reference_id: restaurantId,
      line_items: [
        plan.stripe_price_id
          ? { price: plan.stripe_price_id, quantity: 1 }
          : {
              quantity: 1,
              price_data: {
                currency: "brl",
                unit_amount: plan.price_cents,
                recurring: { interval: "month" },
                product_data: { name: `Cardápio AR — ${plan.name}` },
              },
            },
      ],
      // metadata na assinatura → o webhook sabe qual restaurante/plano atualizar
      subscription_data: { metadata: { restaurant_id: restaurantId, plan_id: plan.id } },
      metadata: { kind: "subscription", restaurant_id: restaurantId, plan_id: plan.id },
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
    });
    return { url: session.url! };
  },

  async createOrderCheckout({ order, successUrl, cancelUrl }) {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      customer_email: order.customer_email ?? undefined,
      client_reference_id: order.id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "brl",
            unit_amount: order.total_cents,
            product_data: { name: `Pedido #${order.number} — ${order.restaurant_name}` },
          },
        },
      ],
      metadata: { kind: "order", order_id: order.id },
      success_url: successUrl,
      cancel_url: cancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });
    return { url: session.url!, externalId: session.id };
  },
};
