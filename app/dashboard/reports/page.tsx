import type { Metadata } from "next";
import Link from "next/link";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import { EMPTY_METRICS, startOfDayInTz, type DashboardMetrics } from "@/lib/metrics";
import { ORDER_TYPE_LABEL } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Relatórios" };

const RANGES = { "7": 7, "30": 30, "90": 90 } as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { restaurant, subscription } = await getCurrentTenant();
  if (!restaurant) return null;
  const { days: daysParam } = await searchParams;
  const days = RANGES[(daysParam ?? "30") as keyof typeof RANGES] ?? 30;

  const advanced = Boolean(subscription?.plan?.features?.advanced_reports);
  const supabase = await createClient();
  const from = startOfDayInTz(undefined, days - 1);
  const to = new Date(startOfDayInTz().getTime() + 864e5);
  const { data } = await supabase.rpc("dashboard_metrics", { p_restaurant_id: restaurant.id, p_from: from.toISOString(), p_to: to.toISOString() });
  const m = (data as DashboardMetrics) ?? EMPTY_METRICS;
  const maxDay = Math.max(1, ...m.daily.map((d) => d.revenue_cents));

  const funnel = [
    { label: "Visualizaram o cardápio", value: m.events.menu_view?.sessions ?? 0 },
    { label: "Abriram um produto", value: m.events.product_view?.sessions ?? 0 },
    { label: "Viram em 3D", value: m.events.model_view_3d?.sessions ?? 0 },
    { label: "Abriram em AR", value: m.events.ar_session_start?.sessions ?? 0 },
    { label: "Fizeram pedido", value: m.events.order_placed?.count ?? 0 },
  ];
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">Relatórios</h1>
        <nav aria-label="Período" className="flex gap-1 rounded-lg bg-muted p-1">
          {Object.keys(RANGES).map((d) => (
            <Link
              key={d}
              href={`?days=${d}`}
              aria-current={Number(d) === days ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm ${Number(d) === days ? "bg-background font-semibold shadow-sm" : ""}`}
            >
              {d} dias
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader><CardDescription>Faturamento</CardDescription><CardTitle className="text-2xl">{formatCurrency(m.revenue_cents)}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Pedidos ({m.cancelled_count} cancelados)</CardDescription><CardTitle className="text-2xl">{m.orders_count}</CardTitle></CardHeader></Card>
        <Card><CardHeader><CardDescription>Ticket médio</CardDescription><CardTitle className="text-2xl">{formatCurrency(m.avg_ticket_cents)}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Faturamento diário</CardTitle></CardHeader>
        <CardContent>
          {m.daily.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Sem vendas no período.</p>
          ) : (
            <ul className="flex h-48 items-end gap-1" aria-label="Gráfico de faturamento por dia">
              {m.daily.map((d) => (
                <li key={d.day} className="group relative flex-1" style={{ height: `${(d.revenue_cents / maxDay) * 100}%` }}>
                  <div className="size-full rounded-t bg-primary/80 group-hover:bg-accent" />
                  <span className="sr-only">{new Date(d.day).toLocaleDateString("pt-BR")}: {formatCurrency(d.revenue_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="relative grid gap-4 lg:grid-cols-2">
        {!advanced && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-background/80 backdrop-blur-sm">
            <Lock className="size-6" aria-hidden />
            <p className="font-semibold">Relatórios avançados no plano Pro</p>
            <Link href="/dashboard/settings?tab=billing" className="text-sm text-primary underline">Fazer upgrade</Link>
          </div>
        )}
        <Card aria-hidden={!advanced}>
          <CardHeader>
            <CardTitle>Funil 3D/AR → Pedido</CardTitle>
            <CardDescription>Sessões únicas no período</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {(advanced ? funnel : []).map((f) => (
              <div key={f.label}>
                <div className="mb-1 flex justify-between text-sm"><span>{f.label}</span><span className="font-semibold">{f.value}</span></div>
                <div className="h-2 rounded bg-muted"><div className="h-2 rounded bg-accent" style={{ width: `${(f.value / funnelMax) * 100}%` }} /></div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card aria-hidden={!advanced}>
          <CardHeader><CardTitle>Mais vendidos</CardTitle></CardHeader>
          <CardContent>
            <ol className="grid gap-2 text-sm">
              {(advanced ? m.top_products : []).map((p, i) => (
                <li key={p.name} className="flex justify-between">
                  <span>{i + 1}. {p.name} <span className="text-muted-foreground">({p.quantity})</span></span>
                  <span className="font-semibold">{formatCurrency(p.revenue_cents)}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {advanced && Object.entries(m.by_type).map(([k, v]) => (
                <span key={k} className="rounded-full bg-muted px-2 py-1">{ORDER_TYPE_LABEL[k as keyof typeof ORDER_TYPE_LABEL]}: {v}</span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
