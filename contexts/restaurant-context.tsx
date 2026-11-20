"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MemberRole, Plan, Restaurant, Subscription } from "@/lib/types";

/**
 * Contexto do painel: restaurante atual (tenant), papel do usuário e assinatura.
 * Hidratado no servidor (app/dashboard/layout.tsx) → sem flicker/loading inicial.
 * Todo componente do admin usa `restaurant.id` daqui para filtrar queries.
 */
interface RestaurantContextValue {
  restaurant: Restaurant;
  role: MemberRole;
  subscription: Subscription | null;
  plan: Plan | null;
  canManage: boolean;
  refresh: () => Promise<void>;
  setRestaurant: (patch: Partial<Restaurant>) => void;
}

const RestaurantContext = createContext<RestaurantContextValue | null>(null);

export function RestaurantProvider({
  initialRestaurant,
  role,
  initialSubscription,
  children,
}: {
  initialRestaurant: Restaurant;
  role: MemberRole;
  initialSubscription: Subscription | null;
  children: React.ReactNode;
}) {
  const [restaurant, setRestaurantState] = useState(initialRestaurant);
  const [subscription, setSubscription] = useState(initialSubscription);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const [{ data: r }, { data: s }] = await Promise.all([
      supabase.from("restaurants").select("*").eq("id", restaurant.id).single(),
      supabase.from("subscriptions").select("*, plan:plans(*)").eq("restaurant_id", restaurant.id).maybeSingle(),
    ]);
    if (r) setRestaurantState(r as Restaurant);
    setSubscription((s as Subscription) ?? null);
  }, [restaurant.id]);

  const setRestaurant = useCallback((patch: Partial<Restaurant>) => {
    setRestaurantState((prev) => ({ ...prev, ...patch }));
  }, []);

  const value = useMemo<RestaurantContextValue>(
    () => ({
      restaurant,
      role,
      subscription,
      plan: subscription?.plan ?? null,
      canManage: role === "owner" || role === "manager",
      refresh,
      setRestaurant,
    }),
    [restaurant, role, subscription, refresh, setRestaurant],
  );

  return <RestaurantContext.Provider value={value}>{children}</RestaurantContext.Provider>;
}

export function useRestaurant() {
  const ctx = useContext(RestaurantContext);
  if (!ctx) throw new Error("useRestaurant deve ser usado dentro de <RestaurantProvider>");
  return ctx;
}
