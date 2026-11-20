export interface DashboardMetrics {
  revenue_cents: number;
  orders_count: number;
  cancelled_count: number;
  avg_ticket_cents: number;
  by_type: Partial<Record<"delivery" | "pickup" | "dine_in", number>>;
  events: Partial<Record<string, { count: number; sessions: number }>>;
  daily: { day: string; revenue_cents: number; orders: number }[];
  top_products: { name: string; quantity: number; revenue_cents: number }[];
  ar_conversion: { viewed_3d: number; ordered: number };
}

export const EMPTY_METRICS: DashboardMetrics = {
  revenue_cents: 0, orders_count: 0, cancelled_count: 0, avg_ticket_cents: 0,
  by_type: {}, events: {}, daily: [], top_products: [], ar_conversion: { viewed_3d: 0, ordered: 0 },
};

/** Início do dia no fuso do restaurante (padrão São Paulo). */
export function startOfDayInTz(timeZone = "America/Sao_Paulo", daysAgo = 0) {
  const now = new Date(Date.now() - daysAgo * 864e5);
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const offsetPart = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value.replace("GMT", "") || "+00:00";
  return new Date(`${ymd}T00:00:00${offsetPart === "" ? "Z" : offsetPart}`);
}
