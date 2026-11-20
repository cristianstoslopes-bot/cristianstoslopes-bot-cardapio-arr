import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant";
import { RestaurantProvider } from "@/contexts/restaurant-context";
import { DashboardShell } from "@/components/dashboard/shell";
import { PageLoader } from "@/components/ui/page-loader";

/** Resolve o tenant (cookies/sessão = dado de runtime) dentro de um Suspense. */
async function TenantGate({ children }: { children: React.ReactNode }) {
  const { user, restaurant, role, subscription } = await getCurrentTenant();
  if (!user) redirect("/login");
  if (!restaurant || !role) redirect("/onboarding");

  return (
    <RestaurantProvider initialRestaurant={restaurant} role={role} initialSubscription={subscription}>
      <DashboardShell userEmail={user.email ?? ""}>{children}</DashboardShell>
    </RestaurantProvider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageLoader label="Carregando painel…" />}>
      <TenantGate>{children}</TenantGate>
    </Suspense>
  );
}
