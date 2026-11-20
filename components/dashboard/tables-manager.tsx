"use client";

/**
 * Mesas + QR Codes únicos. Cada mesa gera um QR para /r/{slug}/table/{id};
 * o registro em `qr_codes` guarda a URL e o contador de scans.
 * Impressão: página de impressão com todos os QRs (window.print + CSS print).
 */
import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Plus, Printer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useRestaurant } from "@/contexts/restaurant-context";
import { useSubscription } from "@/hooks/use-subscription";
import { qrPngDataUrl, qrSvg, tableUrl } from "@/lib/qr";
import type { Table } from "@/lib/types";
import { friendlyDbError } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type TableWithQr = Table & { svg: string; url: string; scans: number };

export function TablesManager({ siteUrl }: { siteUrl: string }) {
  const { restaurant } = useRestaurant();
  const { limit } = useSubscription();
  const supabase = createClient();
  const [tables, setTables] = useState<TableWithQr[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [bulk, setBulk] = useState(10);
  const [busy, setBusy] = useState(false);

  const withQr = useCallback(
    async (t: Table, scans = 0): Promise<TableWithQr> => {
      const url = tableUrl(siteUrl, restaurant.slug, t.id);
      return { ...t, url, scans, svg: await qrSvg(url, restaurant.theme?.primary ?? "#1C1C1A") };
    },
    [siteUrl, restaurant.slug, restaurant.theme?.primary],
  );

  const load = useCallback(async () => {
    const [{ data: t, error }, { data: q }] = await Promise.all([
      supabase.from("tables").select("*").eq("restaurant_id", restaurant.id).order("created_at"),
      supabase.from("qr_codes").select("table_id, scans").eq("restaurant_id", restaurant.id),
    ]);
    if (error) toast.error(friendlyDbError(error.message));
    const scans = new Map((q ?? []).map((r: { table_id: string | null; scans: number }) => [r.table_id, r.scans]));
    setTables(await Promise.all(((t ?? []) as Table[]).map((x) => withQr(x, scans.get(x.id) ?? 0))));
    setLoading(false);
  }, [supabase, restaurant.id, withQr]);

  useEffect(() => {
    // Fetch inicial do Supabase (sistema externo)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const createTables = async (labels: string[]) => {
    setBusy(true);
    const { data, error } = await supabase
      .from("tables")
      .insert(labels.map((l) => ({ restaurant_id: restaurant.id, label: l })))
      .select();
    if (error) {
      setBusy(false);
      return toast.error(friendlyDbError(error.message));
    }
    const created = data as Table[];
    // Registra o QR de cada mesa (URL única)
    await supabase.from("qr_codes").insert(
      created.map((t) => ({ restaurant_id: restaurant.id, table_id: t.id, target_url: tableUrl(siteUrl, restaurant.slug, t.id) })),
    );
    const enriched = await Promise.all(created.map((t) => withQr(t)));
    setTables((ts) => [...ts, ...enriched]);
    setBusy(false);
    toast.success(`${created.length} mesa(s) criada(s)`);
  };

  const addOne = () => {
    if (!label.trim()) return;
    void createTables([label.trim()]);
    setLabel("");
  };

  const addBulk = () => {
    const existing = new Set(tables.map((t) => t.label));
    const labels: string[] = [];
    for (let i = 1; labels.length < bulk && i < 1000; i++) if (!existing.has(String(i))) labels.push(String(i));
    void createTables(labels);
  };

  const remove = async (t: TableWithQr) => {
    if (!confirm(`Excluir a mesa ${t.label}? O QR Code impresso deixará de funcionar.`)) return;
    const { error } = await supabase.from("tables").delete().eq("id", t.id).eq("restaurant_id", restaurant.id);
    if (error) return toast.error(friendlyDbError(error.message));
    setTables((ts) => ts.filter((x) => x.id !== t.id));
  };

  const downloadPng = async (t: TableWithQr) => {
    const a = document.createElement("a");
    a.href = await qrPngDataUrl(t.url);
    a.download = `${restaurant.slug}-mesa-${t.label}.png`;
    a.click();
  };

  const maxTables = limit("max_tables");

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="font-display text-3xl font-bold">Mesas e QR Codes</h1>
          <p className="text-sm text-muted-foreground">
            {tables.length} mesas{maxTables !== -1 && ` de ${maxTables} do plano`}. Cada QR abre o cardápio já vinculado à mesa.
          </p>
        </div>
        <Button variant="outline" onClick={() => window.print()} disabled={!tables.length}><Printer /> Imprimir todos</Button>
      </div>

      <Card className="print:hidden">
        <CardContent className="flex flex-wrap items-end gap-4 p-5">
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); addOne(); }}>
            <div className="grid gap-1.5">
              <Label htmlFor="t-label">Nova mesa</Label>
              <Input id="t-label" placeholder="Ex.: 12 ou Varanda 3" value={label} onChange={(e) => setLabel(e.target.value)} className="w-48" />
            </div>
            <Button type="submit" disabled={busy}><Plus /> Adicionar</Button>
          </form>
          <div className="flex items-end gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="t-bulk">Criar em lote</Label>
              <Input id="t-bulk" type="number" min={1} max={100} value={bulk} onChange={(e) => setBulk(Number(e.target.value))} className="w-24" />
            </div>
            <Button variant="outline" onClick={addBulk} disabled={busy}>{busy && <Loader2 className="animate-spin" />}Gerar mesas</Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 print:grid-cols-3">
          {tables.map((t) => (
            <li key={t.id} className="grid justify-items-center gap-2 rounded-xl border bg-card p-4 text-center print:break-inside-avoid">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{restaurant.name}</p>
              <div className="w-full max-w-40" role="img" aria-label={`QR Code da mesa ${t.label}`} dangerouslySetInnerHTML={{ __html: t.svg }} />
              <p className="font-display text-xl font-bold">Mesa {t.label}</p>
              <p className="text-xs text-muted-foreground print:block">Aponte a câmera · veja os pratos em 3D</p>
              <p className="text-xs text-muted-foreground print:hidden">{t.scans} scans</p>
              <div className="flex gap-1 print:hidden">
                <Button variant="ghost" size="icon" aria-label={`Baixar PNG da mesa ${t.label}`} onClick={() => downloadPng(t)}><Download /></Button>
                <Button variant="ghost" size="icon" aria-label={`Excluir mesa ${t.label}`} onClick={() => remove(t)}><Trash2 /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
