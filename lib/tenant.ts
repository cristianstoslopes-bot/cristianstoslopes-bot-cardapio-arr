import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { MemberRole, Restaurant, Subscription } from "@/lib/types";

export const CURRENT_RESTAURANT_COOKIE = "current_restaurant";

/**
 * Resolve o tenant atual do usuário logado (cacheado por request).
 * A lista vem de `public.users` via RLS → o usuário só enxerga restaurantes dos quais é membro.
 * O cookie apenas ESCOLHE entre eles; forjar o cookie não dá acesso a outro tenant.
 */
export const getCurrentTenant = cache(async () => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { user: null, restaurant: null, role: null, subscription: null, memberships: [] } as const;

  const { data: memberships } = await supabase
    .from("users")
    .select("role, restaurant:restaurants(*)")
    .eq("user_id", auth.user.id)
    .order("created_at");

  const list = (memberships ?? []) as unknown as { role: MemberRole; restaurant: Restaurant }[];
  const preferred = (await cookies()).get(CURRENT_RESTAURANT_COOKIE)?.value;
  const current = list.find((m) => m.restaurant.id === preferred) ?? list[0];

  if (!current) return { user: auth.user, restaurant: null, role: null, subscription: null, memberships: list } as const;

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("*, plan:plans(*)")
    .eq("restaurant_id", current.restaurant.id)
    .maybeSingle();

  return {
    user: auth.user,
    restaurant: current.restaurant,
    role: current.role,
    subscription: (subscription as Subscription) ?? null,
    memberships: list,
  } as const;
});
