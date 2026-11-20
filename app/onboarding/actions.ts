"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_RESTAURANT_COOKIE } from "@/lib/tenant";
import { friendlyDbError } from "@/lib/utils";

export type OnboardingState = { error?: string } | undefined;

const schema = z.object({
  name: z.string().trim().min(2, "Nome muito curto").max(80),
  slug: z.string().trim().regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/, "Use apenas letras minúsculas, números e hífen (3-48)"),
});

export async function createRestaurant(_: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  // RPC SECURITY DEFINER: cria restaurante + vínculo owner + trial, numa transação.
  const { data, error } = await supabase.rpc("create_restaurant", { p_name: parsed.data.name, p_slug: parsed.data.slug });
  if (error) return { error: friendlyDbError(error.message) };

  (await cookies()).set(CURRENT_RESTAURANT_COOKIE, (data as { id: string }).id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard/menu?welcome=1");
}
