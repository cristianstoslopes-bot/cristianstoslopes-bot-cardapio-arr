"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useRestaurant } from "@/contexts/restaurant-context";
import { useSubscription } from "@/hooks/use-subscription";
import { BUCKETS, compressImage, publicUrl } from "@/lib/storage";
import type { Coupon, Plan, Restaurant, RestaurantTheme } from "@/lib/types";
import { cn, formatCurrency, friendlyDbError, parseCurrencyToCents, slugify } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");

export function SettingsView({
  plans, initialCoupons, billingStatus, initialTab = "general",
}: { plans: Plan[]; initialCoupons: Coupon[]; billingStatus?: string; initialTab?: string }) {
  const [tab, setTab] = useState(initialTab);
  useEffect(() => {
    if (billingStatus === "success") toast.success("Assinatura confirmada! Pode levar alguns segundos para atualizar.");
    if (billingStatus === "cancelled") toast.info("Checkout cancelado.");
  }, [billingStatus]);

  return (
    <div className="grid gap-6">
      <h1 className="font-display text-3xl font-bold">Configurações</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="general">Geral</TabsTrigger>
          <TabsTrigger value="operation">Operação</TabsTrigger>
          <TabsTrigger value="appearance">Aparência</TabsTrigger>
          <TabsTrigger value="coupons">Cupons</TabsTrigger>
          <TabsTrigger value="billing">Assinatura</TabsTrigger>
        </TabsList>
        <TabsContent value="general"><GeneralSettings /></TabsContent>
        <TabsContent value="operation"><OperationSettings /></TabsContent>
        <TabsContent value="appearance"><AppearanceSettings /></TabsContent>
        <TabsContent value="coupons"><CouponsSettings initial={initialCoupons} /></TabsContent>
        <TabsContent value="billing"><BillingSettings plans={plans} /></TabsContent>
      </Tabs>
    </div>
  );
}

/** Salva um patch do restaurante (RLS: só owner/manager) e atualiza o contexto. */
function useSaveRestaurant() {
  const { restaurant, setRestaurant } = useRestaurant();
  const [saving, setSaving] = useState(false);
  const save = async (patch: Partial<Restaurant>) => {
    setSaving(true);
    const { error } = await createClient().from("restaurants").update(patch).eq("id", restaurant.id);
    setSaving(false);
    if (error) return toast.error(friendlyDbError(error.message));
    setRestaurant(patch);
    toast.success("Alterações salvas");
  };
  return { save, saving };
}

function GeneralSettings() {
  const { restaurant } = useRestaurant();
  const { save, saving } = useSaveRestaurant();
  const [form, setForm] = useState({
    name: restaurant.name, slug: restaurant.slug, description: restaurant.description ?? "",
    phone: restaurant.phone ?? "", whatsapp: restaurant.whatsapp ?? "",
    street: restaurant.address?.street ?? "", city: restaurant.address?.city ?? "",
  });
  const f = (k: keyof typeof form) => ({
    id: `s-${k}`, value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value }),
  });

  return (
    <Card>
      <form onSubmit={(e) => {
        e.preventDefault();
        void save({
          name: form.name.trim(), slug: slugify(form.slug), description: form.description || null,
          phone: form.phone || null, whatsapp: form.whatsapp.replace(/\D/g, "") || null,
          address: { ...restaurant.address, street: form.street, city: form.city },
        });
      }}>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="s-name">Nome</Label><Input {...f("name")} required /></div>
          <div className="grid gap-1.5">
            <Label htmlFor="s-slug">Endereço do cardápio (/r/…)</Label><Input {...f("slug")} required />
            {form.slug !== restaurant.slug && <p className="text-xs text-amber-700">Atenção: QR Codes já impressos usam o endereço antigo.</p>}
          </div>
          <div className="grid gap-1.5 sm:col-span-2"><Label htmlFor="s-description">Descrição</Label><Textarea {...f("description")} rows={2} /></div>
          <div className="grid gap-1.5"><Label htmlFor="s-phone">Telefone</Label><Input {...f("phone")} inputMode="tel" /></div>
          <div className="grid gap-1.5"><Label htmlFor="s-whatsapp">WhatsApp (com DDD)</Label><Input {...f("whatsapp")} inputMode="tel" /></div>
          <div className="grid gap-1.5"><Label htmlFor="s-street">Endereço</Label><Input {...f("street")} /></div>
          <div className="grid gap-1.5"><Label htmlFor="s-city">Cidade</Label><Input {...f("city")} /></div>
        </CardContent>
        <CardFooter><Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" />}Salvar</Button></CardFooter>
      </form>
    </Card>
  );
}

function OperationSettings() {
  const { restaurant } = useRestaurant();
  const { save, saving } = useSaveRestaurant();
  const [s, setS] = useState({
    is_open: restaurant.is_open, accepts_delivery: restaurant.accepts_delivery, accepts_pickup: restaurant.accepts_pickup,
    accepts_dine_in: restaurant.accepts_dine_in, fee: money(restaurant.delivery_fee_cents), min: money(restaurant.min_order_cents),
  });
  const toggles = [
    ["is_open", "Loja aberta (recebendo pedidos)"], ["accepts_delivery", "Aceita delivery"],
    ["accepts_pickup", "Aceita retirada no balcão"], ["accepts_dine_in", "Aceita pedidos na mesa (QR Code)"],
  ] as const;

  return (
    <Card>
      <CardContent className="grid gap-5 pt-5">
        {toggles.map(([k, label]) => (
          <label key={k} className="flex items-center justify-between gap-4 text-sm">
            {label}
            <Switch checked={s[k]} onCheckedChange={(v) => setS({ ...s, [k]: v })} />
          </label>
        ))}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5"><Label htmlFor="fee">Taxa de entrega (R$)</Label><Input id="fee" inputMode="decimal" value={s.fee} onChange={(e) => setS({ ...s, fee: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="min">Pedido mínimo delivery (R$)</Label><Input id="min" inputMode="decimal" value={s.min} onChange={(e) => setS({ ...s, min: e.target.value })} /></div>
        </div>
      </CardContent>
      <CardFooter>
        <Button disabled={saving} onClick={() => save({
          is_open: s.is_open, accepts_delivery: s.accepts_delivery, accepts_pickup: s.accepts_pickup, accepts_dine_in: s.accepts_dine_in,
          delivery_fee_cents: parseCurrencyToCents(s.fee), min_order_cents: parseCurrencyToCents(s.min),
        })}>{saving && <Loader2 className="animate-spin" />}Salvar</Button>
      </CardFooter>
    </Card>
  );
}

function AppearanceSettings() {
  const { restaurant, setRestaurant } = useRestaurant();
  const { save, saving } = useSaveRestaurant();
  const [theme, setTheme] = useState<RestaurantTheme>(restaurant.theme);
  const [uploading, setUploading] = useState<"logo" | "cover" | null>(null);

  const upload = async (kind: "logo" | "cover", file: File) => {
    setUploading(kind);
    const supabase = createClient();
    try {
      const blob = await compressImage(file, kind === "logo" ? 512 : 1920);
      const path = `${restaurant.id}/branding/${kind}-${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage.from(BUCKETS.assets).upload(path, blob, { contentType: "image/webp", cacheControl: "31536000" });
      if (error) throw error;
      const url = publicUrl(BUCKETS.assets, path)!;
      const patch = kind === "logo" ? { logo_url: url } : { cover_url: url };
      const upd = await supabase.from("restaurants").update(patch).eq("id", restaurant.id);
      if (upd.error) throw upd.error;
      setRestaurant(patch);
      toast.success(kind === "logo" ? "Logo atualizado" : "Capa atualizada");
    } catch (e) {
      toast.error(friendlyDbError((e as Error).message));
    } finally {
      setUploading(null);
    }
  };

  const colors: [keyof RestaurantTheme, string][] = [
    ["primary", "Cor principal (botões, cabeçalho)"], ["accent", "Destaque (preços, AR)"],
    ["secondary", "Secundária (fundos suaves)"], ["background", "Fundo"], ["foreground", "Texto"],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader><CardTitle>Cores do cardápio</CardTitle><CardDescription>Aplicadas em /r/{restaurant.slug}</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
          {colors.map(([key, label]) => (
            <div key={key} className="flex items-center gap-3">
              <input id={`c-${key}`} type="color" value={theme[key]} onChange={(e) => setTheme({ ...theme, [key]: e.target.value })} className="h-10 w-14 cursor-pointer rounded border" />
              <Label htmlFor={`c-${key}`} className="flex-1">{label}</Label>
              <code className="text-xs text-muted-foreground">{theme[key]}</code>
            </div>
          ))}
          <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
            {(["logo", "cover"] as const).map((kind) => (
              <div key={kind} className="grid gap-1.5">
                <Label htmlFor={`up-${kind}`}>{kind === "logo" ? "Logo" : "Imagem de capa"}</Label>
                <Input id={`up-${kind}`} type="file" accept="image/*" disabled={uploading !== null}
                  onChange={(e) => e.target.files?.[0] && upload(kind, e.target.files[0])} />
                {uploading === kind && <p className="flex items-center gap-1 text-xs"><Upload className="size-3" /> Enviando…</p>}
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter><Button disabled={saving} onClick={() => save({ theme })}>{saving && <Loader2 className="animate-spin" />}Salvar tema</Button></CardFooter>
      </Card>

      {/* Pré-visualização ao vivo */}
      <div aria-label="Pré-visualização do cardápio" className="overflow-hidden rounded-2xl border shadow-sm" style={{ background: theme.background, color: theme.foreground }}>
        <div className="h-24 bg-cover bg-center" style={{ backgroundColor: theme.primary, backgroundImage: restaurant.cover_url ? `url(${restaurant.cover_url})` : undefined }} />
        <div className="p-4">
          <p className="font-display text-xl font-bold">{restaurant.name}</p>
          <div className="mt-3 flex items-center gap-3 rounded-xl p-3" style={{ background: theme.secondary }}>
            <div className="size-14 rounded-lg" style={{ background: theme.primary, opacity: 0.25 }} />
            <div className="flex-1">
              <p className="text-sm font-semibold">X-Bacon Artesanal</p>
              <p className="text-sm font-bold" style={{ color: theme.accent }}>R$ 34,90</p>
            </div>
          </div>
          <button className="mt-4 w-full rounded-lg py-3 text-sm font-semibold" style={{ background: theme.primary, color: theme.background }}>Ver carrinho</button>
        </div>
      </div>
    </div>
  );
}

function CouponsSettings({ initial }: { initial: Coupon[] }) {
  const { restaurant } = useRestaurant();
  const [coupons, setCoupons] = useState(initial);
  const [form, setForm] = useState({ code: "", type: "percent" as "percent" | "fixed", value: "10", min: "", maxUses: "", expires: "" });
  const [saving, setSaving] = useState(false);

  const create = async () => {
    const code = form.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,24}$/.test(code)) return toast.error("Código: 3-24 letras/números, sem espaços");
    const value = form.type === "percent" ? Number(form.value) : parseCurrencyToCents(form.value);
    if (!value || (form.type === "percent" && value > 100)) return toast.error("Valor de desconto inválido");
    setSaving(true);
    const { data, error } = await createClient()
      .from("coupons")
      .insert({
        restaurant_id: restaurant.id, code, discount_type: form.type, discount_value: value,
        min_order_cents: form.min ? parseCurrencyToCents(form.min) : 0,
        max_uses: form.maxUses ? Number(form.maxUses) : null,
        expires_at: form.expires ? new Date(`${form.expires}T23:59:59`).toISOString() : null,
      })
      .select()
      .single();
    setSaving(false);
    if (error) return toast.error(friendlyDbError(error.message));
    setCoupons((c) => [data as Coupon, ...c]);
    setForm({ ...form, code: "" });
    toast.success("Cupom criado");
  };

  const toggle = async (c: Coupon) => {
    const { error } = await createClient().from("coupons").update({ is_active: !c.is_active }).eq("id", c.id).eq("restaurant_id", restaurant.id);
    if (error) return toast.error(friendlyDbError(error.message));
    setCoupons((cs) => cs.map((x) => (x.id === c.id ? { ...x, is_active: !x.is_active } : x)));
  };

  const remove = async (c: Coupon) => {
    if (!confirm(`Excluir cupom ${c.code}?`)) return;
    const { error } = await createClient().from("coupons").delete().eq("id", c.id).eq("restaurant_id", restaurant.id);
    if (error) return toast.error(friendlyDbError(error.message));
    setCoupons((cs) => cs.filter((x) => x.id !== c.id));
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-3 lg:grid-cols-6 lg:items-end">
          <div className="grid gap-1.5"><Label htmlFor="cp-code">Código</Label><Input id="cp-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="BEMVINDO10" /></div>
          <div className="grid gap-1.5"><Label htmlFor="cp-type">Tipo</Label>
            <NativeSelect id="cp-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "percent" | "fixed" })}>
              <option value="percent">Percentual (%)</option><option value="fixed">Valor fixo (R$)</option>
            </NativeSelect>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="cp-value">Desconto</Label><Input id="cp-value" inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="cp-min">Mínimo (R$)</Label><Input id="cp-min" inputMode="decimal" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label htmlFor="cp-exp">Validade</Label><Input id="cp-exp" type="date" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} /></div>
          <Button onClick={create} disabled={saving}><Plus /> Criar</Button>
        </CardContent>
      </Card>
      <ul className="grid gap-2">
        {coupons.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm">
            <code className="font-bold">{c.code}</code>
            <span>{c.discount_type === "percent" ? `${c.discount_value}%` : formatCurrency(c.discount_value)} off</span>
            {c.min_order_cents > 0 && <span className="text-muted-foreground">mín. {formatCurrency(c.min_order_cents)}</span>}
            <span className="text-muted-foreground">{c.used_count}{c.max_uses ? `/${c.max_uses}` : ""} usos</span>
            {c.expires_at && <span className="text-muted-foreground">até {new Date(c.expires_at).toLocaleDateString("pt-BR")}</span>}
            <div className="ml-auto flex items-center gap-2">
              <Switch checked={c.is_active} onCheckedChange={() => toggle(c)} aria-label={`Ativar cupom ${c.code}`} />
              <Button variant="ghost" size="icon" aria-label={`Excluir cupom ${c.code}`} onClick={() => remove(c)}><Trash2 /></Button>
            </div>
          </li>
        ))}
        {coupons.length === 0 && <p className="text-center text-sm text-muted-foreground">Nenhum cupom criado.</p>}
      </ul>
    </div>
  );
}

function BillingSettings({ plans }: { plans: Plan[] }) {
  const { role } = useRestaurant();
  const { subscription, plan: current, trialDaysLeft, isActive } = useSubscription();
  const [loading, setLoading] = useState<string | null>(null);

  const checkout = async (planId: string) => {
    setLoading(planId);
    const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId }) });
    const json = (await res.json()) as { url?: string; error?: string };
    if (json.url) window.location.assign(json.url);
    else {
      toast.error(json.error ?? "Não foi possível iniciar o checkout");
      setLoading(null);
    }
  };

  return (
    <div className="grid gap-4">
      <p className="text-sm">
        Plano atual: <strong>{current?.name ?? "—"}</strong>{" "}
        {subscription?.status === "trialing" && trialDaysLeft !== null && <Badge variant="warning">Trial: {trialDaysLeft} dias restantes</Badge>}
        {subscription?.status === "past_due" && <Badge variant="destructive">Pagamento pendente</Badge>}
        {!isActive && <Badge variant="destructive">Inativo — recursos limitados</Badge>}
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const isCurrent = p.id === current?.id && subscription?.status === "active";
          return (
            <Card key={p.id} className={cn(p.id === "pro" && "border-accent ring-1 ring-accent")}>
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
                <p className="text-2xl font-bold">{formatCurrency(p.price_cents)}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
              </CardHeader>
              <CardContent className="grid gap-1.5 text-sm">
                {[
                  [true, p.features.max_products === -1 ? "Produtos ilimitados" : `Até ${p.features.max_products} produtos`],
                  [true, p.features.max_tables === -1 ? "Mesas ilimitadas" : `Até ${p.features.max_tables} mesas`],
                  [p.features.ar, "Modelos 3D + Realidade Aumentada"],
                  [p.features.online_payments, "Pagamento online"],
                  [p.features.advanced_reports, "Relatórios e funil AR"],
                ].map(([ok, label]) => (
                  <p key={String(label)} className={cn("flex items-center gap-2", !ok && "text-muted-foreground line-through")}>
                    <Check className="size-4" aria-hidden /> {label}
                  </p>
                ))}
              </CardContent>
              <CardFooter>
                <Button className="w-full" variant={p.id === "pro" ? "accent" : "outline"} disabled={isCurrent || role !== "owner" || loading !== null} onClick={() => checkout(p.id)}>
                  {loading === p.id && <Loader2 className="animate-spin" />}
                  {isCurrent ? "Plano atual" : role !== "owner" ? "Somente o dono" : "Assinar"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
