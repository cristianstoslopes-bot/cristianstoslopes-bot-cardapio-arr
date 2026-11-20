import Link from "next/link";
import { Box, DollarSign, Receipt, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { EMPTY_METRICS, startOfDayInTz, type DashboardMetrics } from "@/lib/metrics";
import { ORDER_STATUS_LABEL, ORDER_TYPE_LABEL, type Order } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function OverviewPage() {
  const { restaurant } = await getCurrentTenant();
  if (!restaurant) return null;
  const supabase = await createClient();

  const today = startOfDayInTz();
  const tomorrow = new Date(today.getTime() + 864e5);
  const last30 = startOfDayInTz(undefined, 29);

  // Todas as queries filtram por restaurant_id (além do RLS como segunda barreira)
  const [todayRes, monthRes, recentRes] = await Promise.all([
    supabase.rpc("dashboard_metrics", { p_restaurant_id: restaurant.id, p_from: today.toISOString(), p_to: tomorrow.toISOString() }),
    supabase.rpc("dashboard_metrics", { p_restaurant_id: restaurant.id, p_from: last30.toISOString(), p_to: tomorrow.toISOString() }),
    supabase
      .from("orders")
      .select("id, number, customer_name, total_cents, status, type, created_at")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const t = (todayRes.data as DashboardMetrics) ?? EMPTY_METRICS;
  const m = (monthRes.data as DashboardMetrics) ?? EMPTY_METRICS;
  const recent = (recentRes.data ?? []) as Order[];
  const arRate = m.ar_conversion.viewed_3d ? Math.round((m.ar_conversion.ordered / m.ar_conversion.viewed_3d) * 100) : 0;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Visão Geral</h1>
        <p className="text-sm text-muted-foreground">Resumo de hoje e dos últimos 30 dias.</p>
      </div>

      <section aria-label="Métricas de hoje" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Faturamento hoje" value={formatCurrency(t.revenue_cents)} hint={`30 dias: ${formatCurrency(m.revenue_cents)}`} icon={DollarSign} />
        <MetricCard label="Pedidos hoje" value={String(t.orders_count)} hint={`30 dias: ${m.orders_count}`} icon={Receipt} />
        <MetricCard label="Ticket médio (30d)" value={formatCurrency(m.avg_ticket_cents)} icon={TrendingUp} />
        <MetricCard
          label="Conversão 3D/AR → pedido"
          value={`${arRate}%`}
          hint={`${m.ar_conversion.viewed_3d} sessões viram um prato em 3D`}
          icon={Box}
        />
      </section>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Pedidos recentes</CardTitle>
          <Link href="/dashboard/orders" className="text-sm font-medium text-primary hover:underline">
            Abrir painel de pedidos →
          </Link>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhum pedido ainda. Compartilhe seu QR Code!</p>
          ) : (
            <ul className="divide-y">
              {recent.map((o) => (
                <li key={o.id} className="flex items-center gap-3 py-3 text-sm">
                  <span className="w-14 font-mono font-semibold">#{String(o.number).padStart(4, "0")}</span>
                  <span className="min-w-0 flex-1 truncate">{o.customer_name}</span>
                  <Badge variant="outline" className="hidden sm:inline-flex">{ORDER_TYPE_LABEL[o.type]}</Badge>
                  <Badge variant={o.status === "cancelled" ? "destructive" : o.status === "delivered" ? "success" : "warning"}>
                    {ORDER_STATUS_LABEL[o.status]}
                  </Badge>
                  <span className="w-24 text-right font-semibold">{formatCurrency(o.total_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
