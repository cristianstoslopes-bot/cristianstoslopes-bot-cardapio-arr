import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { getPaymentProvider } from "@/lib/payments";
import { SITE_URL } from "@/lib/supabase/env";
import type { Plan } from "@/lib/types";

/** Inicia checkout de assinatura. Somente o OWNER do restaurante atual. */
export async function POST(req: NextRequest) {
  const body = z.object({ planId: z.enum(["starter", "pro", "premium"]) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Plano inválido" }, { status: 400 });

  const { user, restaurant, role } = await getCurrentTenant();
  if (!user || !restaurant) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (role !== "owner") return NextResponse.json({ error: "Apenas o dono pode alterar a assinatura" }, { status: 403 });

  const supabase = await createClient();
  const { data: plan } = await supabase.from("plans").select("*").eq("id", body.data.planId).single();
  if (!plan) return NextResponse.json({ error: "Plano não encontrado" }, { status: 404 });

  try {
    const { url } = await getPaymentProvider().createSubscriptionCheckout({
      restaurantId: restaurant.id,
      plan: plan as Plan,
      customerEmail: user.email!,
      successUrl: `${SITE_URL}/dashboard/settings?billing=success`,
      cancelUrl: `${SITE_URL}/dashboard/settings?billing=cancelled`,
    });
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[billing/checkout]", e);
    return NextResponse.json({ error: "Provedor de pagamento indisponível" }, { status: 502 });
  }
}
