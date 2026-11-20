import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { Coupon, Plan } from "@/lib/types";
import { getCurrentTenant } from "@/lib/tenant";
import { SettingsView } from "@/components/dashboard/settings-view";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ billing?: string; tab?: string }> }) {
  const { restaurant } = await getCurrentTenant();
  if (!restaurant) return null;
  const { billing, tab } = await searchParams;
  const supabase = await createClient();
  const [{ data: plans }, { data: coupons }] = await Promise.all([
    supabase.from("plans").select("*").order("sort_order"),
    supabase.from("coupons").select("*").eq("restaurant_id", restaurant.id).order("created_at", { ascending: false }),
  ]);
  return <SettingsView plans={(plans ?? []) as Plan[]} initialCoupons={(coupons ?? []) as Coupon[]} billingStatus={billing} initialTab={billing ? "billing" : tab} />;
}
