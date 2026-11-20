"use client";

import { useState } from "react";
import { useRestaurant } from "@/contexts/restaurant-context";
import type { PlanFeatures } from "@/lib/types";

type BooleanFeature = { [K in keyof PlanFeatures]: PlanFeatures[K] extends boolean ? K : never }[keyof PlanFeatures];
type LimitFeature = { [K in keyof PlanFeatures]: PlanFeatures[K] extends number ? K : never }[keyof PlanFeatures];

/**
 * Espelho no cliente de `public.active_plan_features()` (SQL).
 * A UI usa para esconder/desabilitar recursos; o BANCO é quem bloqueia de fato
 * (policies + triggers), então burlar a UI não libera nada.
 */
export function useSubscription() {
  const { subscription, plan } = useRestaurant();

  const [now] = useState(() => Date.now()); // estável durante a vida do componente
  const isActive =
    !!subscription &&
    (subscription.status === "active" ||
      (subscription.status === "trialing" && (!subscription.trial_ends_at || new Date(subscription.trial_ends_at).getTime() > now)) ||
      (subscription.status === "past_due" &&
        (!subscription.current_period_end || new Date(subscription.current_period_end).getTime() > now - 3 * 864e5)));

  const features: Partial<PlanFeatures> = isActive ? (plan?.features ?? {}) : {};

  const trialDaysLeft =
    subscription?.status === "trialing" && subscription.trial_ends_at
      ? Math.max(0, Math.ceil((new Date(subscription.trial_ends_at).getTime() - now) / 864e5))
      : null;

  return {
    subscription,
    plan,
    isActive,
    trialDaysLeft,
    /** ex.: can("ar") → Starter = false */
    can: (feature: BooleanFeature) => Boolean(features[feature]),
    /** -1 = ilimitado */
    limit: (feature: LimitFeature) => (features[feature] as number | undefined) ?? 0,
    withinLimit: (feature: LimitFeature, current: number) => {
      const l = (features[feature] as number | undefined) ?? 0;
      return l === -1 || current < l;
    },
  };
}
