import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPaymentProvider } from "@/lib/payments";
import { SITE_URL } from "@/lib/supabase/env";

/**
 * Gera o link de pagamento online de um pedido.
 * O cliente prova a posse do pedido com o `public_token` (UUID secreto devolvido por place_order).
 * O valor vem do banco — nunca do corpo da requisição.
 */
export async function POST(req: NextRequest) {
  const body = z.object({ token: z.string().uuid() }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Requisição inválida" }, { status: 400 });

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, number, total_cents, payment_method, payment_status, public_token, restaurant:restaurants(name, slug)")
    .eq("public_token", body.data.token)
    .single();

  if (!order || order.payment_method !== "online") return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });
  if (order.payment_status === "paid") return NextResponse.json({ error: "Pedido já pago" }, { status: 409 });

  const restaurant = order.restaurant as unknown as { name: string; slug: string };
  const provider = getPaymentProvider();
  const trackUrl = `${SITE_URL}/r/${restaurant.slug}/order/${order.public_token}`;

  try {
    const { url, externalId } = await provider.createOrderCheckout({
      order: { id: order.id, number: order.number, total_cents: order.total_cents, restaurant_name: restaurant.name },
      successUrl: `${trackUrl}?payment=success`,
      cancelUrl: `${trackUrl}?payment=cancelled`,
      notificationUrl: `${SITE_URL}/api/webhooks/mercadopago`,
    });
    await admin.from("orders").update({ payment_provider: provider.name, payment_external_id: externalId }).eq("id", order.id);
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[orders/pay]", e);
    return NextResponse.json({ error: "Pagamento indisponível. Escolha pagar na entrega." }, { status: 502 });
  }
}
