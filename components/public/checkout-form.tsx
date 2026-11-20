"use client";

/**
 * Checkout: dados do cliente, modalidade (Delivery/Retirada/Mesa), cupom e pagamento.
 * O envio chama a RPC `place_order`, que RECALCULA tudo no banco (preços, adicionais,
 * cupom, taxa). Os valores exibidos aqui são apenas estimativa para o cliente.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bike, Loader2, Store, Tag, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/contexts/cart-context";
import { createClient } from "@/lib/supabase/client";
import { getSessionId, track } from "@/lib/analytics";
import { PAYMENT_METHOD_LABEL, type OrderType, type PaymentMethod, type Restaurant } from "@/lib/types";
import { cn, formatCurrency, formatPhone } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const TYPES: { id: OrderType; label: string; icon: React.ElementType; flag: keyof Restaurant }[] = [
  { id: "delivery", label: "Delivery", icon: Bike, flag: "accepts_delivery" },
  { id: "pickup", label: "Retirar no local", icon: Store, flag: "accepts_pickup" },
  { id: "dine_in", label: "Comer na mesa", icon: UtensilsCrossed, flag: "accepts_dine_in" },
];

function readSavedProfile(): { customer?: { name: string; phone: string; email: string }; address?: Record<string, string> } {
  try {
    return JSON.parse(localStorage.getItem("customer_profile") ?? "null") ?? {};
  } catch {
    return {};
  }
}

/** Só renderiza o formulário após o carrinho hidratar do localStorage (mesa, itens). */
export function CheckoutForm({ restaurant }: { restaurant: Restaurant }) {
  const { items, hydrated } = useCart();
  if (!hydrated) return <Loader2 className="mx-auto mt-20 size-8 animate-spin" />;
  if (items.length === 0) {
    return (
      <div className="mx-auto grid max-w-md gap-4 p-8 text-center">
        <p className="text-lg font-semibold">Seu carrinho está vazio</p>
        <Button asChild><Link href={`/r/${restaurant.slug}`}>Ver cardápio</Link></Button>
      </div>
    );
  }
  return <CheckoutFormInner restaurant={restaurant} />;
}

function CheckoutFormInner({ restaurant }: { restaurant: Restaurant }) {
  const router = useRouter();
  const supabase = createClient();
  const { items, subtotalCents, tableId, clear } = useCart();
  const [saved] = useState(readSavedProfile); // dados lembrados neste dispositivo

  const available = TYPES.filter((t) => restaurant[t.flag] && (t.id !== "dine_in" || tableId));
  const [type, setType] = useState<OrderType>(tableId && restaurant.accepts_dine_in ? "dine_in" : available[0]?.id ?? "pickup");
  const [payment, setPayment] = useState<PaymentMethod>("pix");
  const [onlineAllowed, setOnlineAllowed] = useState(false);
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", ...saved.customer });
  const [address, setAddress] = useState({
    street: "", number: "", complement: "", district: "", city: restaurant.address?.city ?? "", reference: "", ...saved.address,
  });
  const [notes, setNotes] = useState("");
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<{ code: string; discount_cents: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    track("checkout_start", { restaurantId: restaurant.id, tableId });
    void supabase.rpc("plan_allows", { p_restaurant_id: restaurant.id, p_feature: "online_payments" }).then(({ data }) => setOnlineAllowed(Boolean(data)));
  }, [restaurant.id, tableId, supabase]);

  const deliveryFee = type === "delivery" ? restaurant.delivery_fee_cents : 0;
  const discount = coupon?.discount_cents ?? 0;
  const total = Math.max(0, subtotalCents - discount) + deliveryFee;
  const belowMin = type === "delivery" && subtotalCents < restaurant.min_order_cents;

  const applyCoupon = async () => {
    if (!couponInput.trim()) return;
    const { data, error } = await supabase.rpc("validate_coupon", { p_restaurant_id: restaurant.id, p_code: couponInput, p_subtotal_cents: subtotalCents });
    const res = data as { valid: boolean; reason?: string; code?: string; discount_cents?: number } | null;
    if (error || !res?.valid) {
      setCoupon(null);
      return toast.error(res?.reason ?? "Cupom inválido");
    }
    setCoupon({ code: res.code!, discount_cents: res.discount_cents! });
    toast.success(`Cupom ${res.code} aplicado!`);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (customer.name.trim().length < 2) e.name = "Informe seu nome";
    const digits = customer.phone.replace(/\D/g, "");
    if (type !== "dine_in" && (digits.length < 10 || digits.length > 11)) e.phone = "Telefone com DDD";
    if (type === "delivery") {
      if (!address.street.trim()) e.street = "Informe a rua";
      if (!address.number.trim()) e.number = "Nº";
      if (!address.district.trim()) e.district = "Informe o bairro";
    }
    setErrors(e);
    if (Object.keys(e).length) document.getElementById(Object.keys(e)[0])?.focus();
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate() || belowMin) return;
    setSubmitting(true);

    const { data, error } = await supabase.rpc("place_order", {
      p_restaurant_id: restaurant.id,
      p_payload: {
        type,
        table_id: type === "dine_in" ? tableId : null,
        payment_method: payment,
        customer: { name: customer.name, phone: customer.phone, email: customer.email || null },
        address: type === "delivery" ? address : null,
        notes: notes || null,
        coupon_code: coupon?.code ?? null,
        session_id: getSessionId(),
        items: items.map((i) => ({ product_id: i.productId, quantity: i.quantity, notes: i.notes ?? null, addons: i.addons })),
      },
    });

    if (error) {
      setSubmitting(false);
      return toast.error(error.message);
    }
    const order = data as { id: string; number: number; public_token: string; total_cents: number };

    try {
      localStorage.setItem("customer_profile", JSON.stringify({ customer, address }));
      const history = JSON.parse(localStorage.getItem(`orders:${restaurant.id}`) ?? "[]") as string[];
      localStorage.setItem(`orders:${restaurant.id}`, JSON.stringify([order.public_token, ...history].slice(0, 10)));
    } catch {}
    clear();

    if (payment === "online") {
      const res = await fetch("/api/orders/pay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: order.public_token }) });
      const json = (await res.json()) as { url?: string; error?: string };
      if (json.url) {
        window.location.assign(json.url);
        return;
      }
      toast.error(json.error ?? "Não foi possível abrir o pagamento. Você pode tentar novamente na tela do pedido.");
    }
    router.replace(`/r/${restaurant.slug}/order/${order.public_token}`);
  };

  const fieldErr = (k: string) => errors[k] && <p id={`${k}-err`} className="text-sm text-destructive">{errors[k]}</p>;
  const methods: PaymentMethod[] = [...(onlineAllowed ? (["online"] as const) : []), "pix", "card_on_delivery", "cash"];

  return (
    <form onSubmit={submit} noValidate className="mx-auto grid max-w-2xl gap-6 p-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label="Voltar ao cardápio">
          <Link href={tableId ? `/r/${restaurant.slug}/table/${tableId}` : `/r/${restaurant.slug}`}><ArrowLeft /></Link>
        </Button>
        <h1 className="font-display text-2xl font-bold">Finalizar pedido</h1>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-2 font-semibold">Como você quer receber?</legend>
        <div className="grid grid-cols-3 gap-2">
          {available.map((t) => (
            <label key={t.id} className={cn("flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-3 text-center text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", type === t.id && "border-primary bg-primary text-primary-foreground")}>
              <input type="radio" name="type" value={t.id} checked={type === t.id} onChange={() => setType(t.id)} className="sr-only" />
              <t.icon className="size-5" aria-hidden />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 font-semibold">Seus dados</legend>
        <div className="grid gap-1.5">
          <Label htmlFor="name">Nome *</Label>
          <Input id="name" autoComplete="name" className="h-12" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-err" : undefined} />
          {fieldErr("name")}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="phone">WhatsApp {type !== "dine_in" && "*"}</Label>
          <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" className="h-12" placeholder="(11) 99999-9999" value={formatPhone(customer.phone)} onChange={(e) => setCustomer({ ...customer, phone: e.target.value.replace(/\D/g, "") })} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "phone-err" : undefined} />
          {fieldErr("phone")}
        </div>
      </fieldset>

      {type === "delivery" && (
        <fieldset className="grid grid-cols-[1fr_96px] gap-3">
          <legend className="mb-2 font-semibold">Endereço de entrega</legend>
          <div className="grid gap-1.5">
            <Label htmlFor="street">Rua *</Label>
            <Input id="street" autoComplete="address-line1" className="h-12" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} aria-invalid={!!errors.street} />
            {fieldErr("street")}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="number">Nº *</Label>
            <Input id="number" className="h-12" value={address.number} onChange={(e) => setAddress({ ...address, number: e.target.value })} aria-invalid={!!errors.number} />
          </div>
          <div className="col-span-2 grid gap-1.5 sm:col-span-1">
            <Label htmlFor="district">Bairro *</Label>
            <Input id="district" className="h-12" value={address.district} onChange={(e) => setAddress({ ...address, district: e.target.value })} aria-invalid={!!errors.district} />
            {fieldErr("district")}
          </div>
          <div className="col-span-2 grid gap-1.5 sm:col-span-1">
            <Label htmlFor="complement">Complemento</Label>
            <Input id="complement" className="h-12" value={address.complement} onChange={(e) => setAddress({ ...address, complement: e.target.value })} />
          </div>
          <div className="col-span-2 grid gap-1.5">
            <Label htmlFor="reference">Ponto de referência</Label>
            <Input id="reference" className="h-12" value={address.reference} onChange={(e) => setAddress({ ...address, reference: e.target.value })} />
          </div>
        </fieldset>
      )}

      <fieldset className="grid gap-2">
        <legend className="mb-2 font-semibold">Pagamento</legend>
        {methods.map((m) => (
          <label key={m} className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", payment === m && "border-primary bg-primary/5")}>
            <input type="radio" name="payment" value={m} checked={payment === m} onChange={() => setPayment(m)} className="size-5 accent-[var(--primary)]" />
            {m === "online" ? "Pagar agora (cartão online)" : PAYMENT_METHOD_LABEL[m]}
          </label>
        ))}
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="coupon">Cupom de desconto</Label>
        <div className="flex gap-2">
          <Input id="coupon" className="h-12 uppercase" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} />
          <Button type="button" variant="outline" className="h-12" onClick={applyCoupon}><Tag /> Aplicar</Button>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="notes">Observações do pedido</Label>
        <Textarea id="notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: troco para R$ 100" />
      </div>

      <section aria-label="Resumo do pedido" className="grid gap-2 rounded-2xl bg-muted p-4 text-sm">
        {items.map((i) => (
          <div key={i.lineId} className="flex justify-between gap-2">
            <span>{i.quantity}× {i.name}</span>
            <span>{formatCurrency((i.unitPriceCents + i.addonsTotalCents) * i.quantity)}</span>
          </div>
        ))}
        <hr className="my-1" />
        <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotalCents)}</span></div>
        {discount > 0 && <div className="flex justify-between text-emerald-700"><span>Cupom {coupon?.code}</span><span>−{formatCurrency(discount)}</span></div>}
        {deliveryFee > 0 && <div className="flex justify-between"><span>Entrega</span><span>{formatCurrency(deliveryFee)}</span></div>}
        <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{formatCurrency(total)}</span></div>
        {belowMin && <p role="alert" className="text-destructive">Pedido mínimo para delivery: {formatCurrency(restaurant.min_order_cents)}</p>}
      </section>

      <Button type="submit" size="lg" className="h-14 text-base" disabled={submitting || belowMin || !restaurant.is_open}>
        {submitting && <Loader2 className="animate-spin" />}
        {restaurant.is_open ? `Enviar pedido · ${formatCurrency(total)}` : "Restaurante fechado"}
      </Button>
    </form>
  );
}
