import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentProvider } from "./types";

const MP_API = "https://api.mercadopago.com";

export async function mp<T>(path: string, init?: RequestInit): Promise<T> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado");
  const res = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": crypto.randomUUID(),
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Valida o header x-signature (ts=...,v1=...) conforme a documentação do Mercado Pago. */
export function verifyMercadoPagoSignature(headers: Headers, dataId: string) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  const signature = headers.get("x-signature");
  const requestId = headers.get("x-request-id");
  if (!secret || !signature || !requestId) return false;
  const parts = Object.fromEntries(signature.split(",").map((p) => p.trim().split("=") as [string, string]));
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const given = parts.v1 ?? "";
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export const mercadoPagoProvider: PaymentProvider = {
  name: "mercadopago",

  async createSubscriptionCheckout({ restaurantId, plan, customerEmail, successUrl }) {
    const data = await mp<{ init_point: string }>("/preapproval", {
      method: "POST",
      body: JSON.stringify({
        reason: `Cardápio AR — ${plan.name}`,
        external_reference: `${restaurantId}:${plan.id}`,
        payer_email: customerEmail,
        back_url: successUrl,
        status: "pending",
        auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: plan.price_cents / 100, currency_id: "BRL" },
      }),
    });
    return { url: data.init_point };
  },

  async createOrderCheckout({ order, successUrl, cancelUrl, notificationUrl }) {
    const data = await mp<{ id: string; init_point: string }>("/checkout/preferences", {
      method: "POST",
      body: JSON.stringify({
        items: [{ title: `Pedido #${order.number} — ${order.restaurant_name}`, quantity: 1, unit_price: order.total_cents / 100, currency_id: "BRL" }],
        external_reference: order.id,
        notification_url: notificationUrl,
        back_urls: { success: successUrl, failure: cancelUrl, pending: successUrl },
        auto_return: "approved",
        payment_methods: { installments: 1 },
        expires: true,
        expiration_date_to: new Date(Date.now() + 30 * 60_000).toISOString(),
      }),
    });
    return { url: data.init_point, externalId: data.id };
  },
};
