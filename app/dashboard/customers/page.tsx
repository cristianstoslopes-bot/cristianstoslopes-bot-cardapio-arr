import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/tenant";
import type { Customer } from "@/lib/types";
import { formatCurrency, formatPhone } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { restaurant } = await getCurrentTenant();
  if (!restaurant) return null;
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("id, name, phone, email, total_orders, total_spent_cents, last_order_at")
    .eq("restaurant_id", restaurant.id)
    .order("last_order_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (q) {
    const term = q.replace(/[%,()]/g, "");
    query = query.or(`name.ilike.%${term}%,phone.ilike.%${term.replace(/\D/g, "") || term}%`);
  }
  const { data } = await query;
  const customers = (data ?? []) as Customer[];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Gerado automaticamente a partir dos pedidos.</p>
        </div>
        <form role="search">
          <label htmlFor="q" className="sr-only">Buscar cliente</label>
          <input id="q" name="q" defaultValue={q} placeholder="Buscar nome ou telefone" className="h-10 w-64 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </form>
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">Lista de clientes</caption>
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th scope="col" className="p-3 font-medium">Nome</th>
                <th scope="col" className="p-3 font-medium">Telefone</th>
                <th scope="col" className="p-3 text-right font-medium">Pedidos</th>
                <th scope="col" className="p-3 text-right font-medium">Total gasto</th>
                <th scope="col" className="p-3 font-medium">Último pedido</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {customers.map((c) => (
                <tr key={c.id}>
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">
                    <a className="text-primary hover:underline" href={`https://wa.me/55${c.phone}`} target="_blank" rel="noreferrer">{formatPhone(c.phone)}</a>
                  </td>
                  <td className="p-3 text-right">{c.total_orders}</td>
                  <td className="p-3 text-right">{formatCurrency(c.total_spent_cents)}</td>
                  <td className="p-3">{c.last_order_at ? new Date(c.last_order_at).toLocaleDateString("pt-BR") : "—"}</td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Nenhum cliente encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
