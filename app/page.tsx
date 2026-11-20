import Link from "next/link";
import { cacheLife } from "next/cache";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { BarChart3, Box, Check, QrCode, Receipt, ShieldCheck, Smartphone, Sparkles, Zap } from "lucide-react";
import type { Plan } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";
import { HeroBurgerLazy } from "@/components/landing/hero-burger-lazy";
import { Button } from "@/components/ui/button";

async function getPlans(): Promise<Plan[]> {
  "use cache";
  cacheLife("hours"); // planos mudam raramente
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];
  // Cliente sem cookies: a landing é pública e cacheável
  const { data } = await createSupabase(url, key).from("plans").select("*").eq("is_active", true).order("sort_order");
  return (data ?? []) as Plan[];
}

const FEATURES = [
  { icon: Box, title: "Pratos em 3D e AR", text: "O cliente aponta o celular para a mesa e vê o hambúrguer em tamanho real. Sem baixar app." },
  { icon: QrCode, title: "QR Code por mesa", text: "Cada mesa tem seu QR. O pedido chega na cozinha já com o número da mesa." },
  { icon: Zap, title: "Pedidos em tempo real", text: "Painel de cozinha com alerta sonoro, status ao vivo e acompanhamento pelo cliente." },
  { icon: Receipt, title: "Delivery, retirada e mesa", text: "Taxa de entrega, pedido mínimo, cupons e pagamento online ou na entrega." },
  { icon: BarChart3, title: "Relatórios que vendem", text: "Faturamento, ticket médio, mais vendidos e o funil 3D → pedido." },
  { icon: ShieldCheck, title: "Seguro por padrão", text: "Dados isolados por restaurante no banco (RLS). Preços sempre validados no servidor." },
];

const FAQ = [
  ["O cliente precisa instalar algum aplicativo?", "Não. Tudo funciona no navegador. No Android usamos WebXR/Scene Viewer e no iPhone o AR Quick Look nativo da Apple."],
  ["E se o celular não suportar Realidade Aumentada?", "O prato aparece em 3D interativo na tela: o cliente gira e dá zoom com os dedos. Ninguém fica sem a experiência."],
  ["Como consigo os modelos 3D dos meus pratos?", "Você pode enviar arquivos GLB/GLTF gerados por fotogrametria (ex.: apps de escaneamento 3D no celular) ou por um modelador. Indicamos parceiros no onboarding."],
  ["Posso usar meu domínio e minhas cores?", "Sim. Logo, capa e paleta de cores são personalizáveis e aplicadas automaticamente no cardápio."],
  ["Tem fidelidade ou taxa por pedido?", "Não. Assinatura mensal fixa, sem comissão por pedido. Cancele quando quiser."],
];

export default async function LandingPage() {
  "use cache"; // página inteira estática, revalidada a cada hora (inclui o ano do rodapé)
  cacheLife("hours");
  const plans = await getPlans();

  return (
    <div className="bg-brand-cream text-brand-charcoal">
      <header className="sticky top-0 z-40 border-b border-brand-forest/10 bg-brand-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-display text-xl font-bold text-brand-forest">
            Cardápio<span className="text-brand-caramel">AR</span>
          </Link>
          <nav aria-label="Principal" className="hidden gap-6 text-sm font-medium md:flex">
            <a href="#recursos" className="hover:text-brand-caramel">Recursos</a>
            <a href="#planos" className="hover:text-brand-caramel">Planos</a>
            <a href="#faq" className="hover:text-brand-caramel">FAQ</a>
          </nav>
          <div className="flex gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex"><Link href="/login">Entrar</Link></Button>
            <Button asChild><Link href="/signup">Teste grátis</Link></Button>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-24">
          <div>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-brand-forest px-3 py-1 text-xs font-semibold text-brand-cream">
              <Sparkles className="size-3.5" aria-hidden /> Realidade Aumentada no cardápio
            </p>
            <h1 className="font-display text-4xl font-bold leading-tight text-brand-forest md:text-6xl">
              Seu cliente vê o prato <span className="text-brand-caramel">na mesa</span> antes de pedir.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-brand-charcoal/80">
              Cardápio digital para hamburguerias e pizzarias com pratos em 3D, QR Code por mesa e pedidos em tempo real na cozinha.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" variant="accent"><Link href="/signup">Começar 14 dias grátis</Link></Button>
              <Button asChild size="lg" variant="outline" className="border-brand-forest/30 bg-transparent"><a href="#recursos">Ver como funciona</a></Button>
            </div>
            <p className="mt-4 text-sm text-brand-charcoal/70">Sem cartão de crédito · Sem comissão por pedido</p>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-md">
            <div className="absolute inset-6 rounded-full bg-brand-forest" aria-hidden />
            <div className="absolute inset-0"><HeroBurgerLazy /></div>
            <div className="absolute bottom-4 left-0 rounded-2xl bg-white p-3 shadow-xl">
              <p className="text-xs text-brand-charcoal/70">Arraste para girar</p>
              <p className="font-semibold">Smash Duplo · <span className="text-brand-caramel">R$ 34,90</span></p>
            </div>
          </div>
        </section>

        {/* VALOR */}
        <section aria-label="Resultados" className="bg-brand-forest py-12 text-brand-cream">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 text-center sm:grid-cols-3">
            {[
              ["3D", "geometria real ancorada na mesa, em escala"],
              ["0 apps", "funciona direto da câmera do celular"],
              ["< 1s", "para o pedido aparecer na cozinha"],
            ].map(([n, t]) => (
              <div key={n}>
                <p className="font-display text-4xl font-bold text-brand-caramel">{n}</p>
                <p className="mt-1 text-sm opacity-80">{t}</p>
              </div>
            ))}
          </div>
        </section>

        {/* RECURSOS */}
        <section id="recursos" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <h2 className="text-center font-display text-3xl font-bold text-brand-forest md:text-4xl">Tudo para vender mais, do QR à cozinha</h2>
          <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-2xl bg-white p-6 shadow-sm">
                <span className="inline-flex rounded-xl bg-brand-cream p-3 text-brand-forest"><Icon className="size-6" aria-hidden /></span>
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-brand-charcoal/75">{text}</p>
              </li>
            ))}
          </ul>
          <ol className="mt-16 grid gap-6 md:grid-cols-3">
            {["Cadastre pratos e envie os modelos 3D", "Imprima os QR Codes das mesas", "Receba pedidos ao vivo no painel"].map((s, i) => (
              <li key={s} className="flex items-center gap-4 rounded-2xl border border-brand-forest/15 p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-caramel font-bold text-brand-charcoal">{i + 1}</span>
                <span className="font-medium">{s}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* PLANOS (lidos do banco) */}
        <section id="planos" className="scroll-mt-20 bg-white py-20">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center font-display text-3xl font-bold text-brand-forest md:text-4xl">Planos simples, sem comissão</h2>
            <p className="mt-2 text-center text-brand-charcoal/70">Todos começam com 14 dias do Pro grátis.</p>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {plans.map((p) => {
                const highlight = p.id === "pro";
                const f = p.features;
                const bullets: [boolean, string][] = [
                  [true, f.max_products === -1 ? "Produtos ilimitados" : `Até ${f.max_products} produtos`],
                  [true, f.max_tables === -1 ? "Mesas e QR ilimitados" : `Até ${f.max_tables} mesas com QR`],
                  [true, "Pedidos em tempo real + cozinha"],
                  [f.ar, f.max_models === -1 ? "Modelos 3D/AR ilimitados" : `Até ${f.max_models} modelos 3D/AR`],
                  [f.online_payments, "Pagamento online (Pix/cartão)"],
                  [f.advanced_reports, "Relatórios e funil de conversão AR"],
                ];
                return (
                  <article key={p.id} className={`relative flex flex-col rounded-3xl p-7 ${highlight ? "bg-brand-forest text-brand-cream shadow-2xl md:-translate-y-3" : "border border-brand-forest/15"}`}>
                    {highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-caramel px-3 py-1 text-xs font-bold text-brand-charcoal">Mais escolhido</span>}
                    <h3 className="font-display text-2xl font-bold">{p.name}</h3>
                    <p className={`mt-1 text-sm ${highlight ? "opacity-80" : "text-brand-charcoal/70"}`}>{p.description}</p>
                    <p className="mt-5 text-4xl font-bold">{formatCurrency(p.price_cents)}<span className="text-base font-normal opacity-70">/mês</span></p>
                    <ul className="mt-6 grid flex-1 gap-2.5 text-sm">
                      {bullets.map(([ok, label]) => (
                        <li key={label} className={`flex items-start gap-2 ${ok ? "" : "opacity-50 line-through"}`}>
                          <Check className={`mt-0.5 size-4 shrink-0 ${highlight ? "text-brand-caramel" : "text-brand-forest"}`} aria-hidden />
                          <span>{label}{!ok && <span className="sr-only"> (não incluso)</span>}</span>
                        </li>
                      ))}
                    </ul>
                    <Button asChild size="lg" variant={highlight ? "accent" : "default"} className="mt-8"><Link href="/signup">Começar grátis</Link></Button>
                  </article>
                );
              })}
              {plans.length === 0 && <p className="col-span-full text-center text-sm">Configure o Supabase para exibir os planos.</p>}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20">
          <h2 className="text-center font-display text-3xl font-bold text-brand-forest">Perguntas frequentes</h2>
          <div className="mt-10 grid gap-3">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group rounded-2xl bg-white p-5 shadow-sm [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-caramel">
                  {q}
                  <span className="text-xl text-brand-caramel transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 text-sm text-brand-charcoal/80">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mx-4 mb-16 rounded-3xl bg-brand-caramel px-6 py-14 text-center md:mx-auto md:max-w-6xl">
          <Smartphone className="mx-auto size-10 text-brand-forest" aria-hidden />
          <h2 className="mt-4 font-display text-3xl font-bold text-brand-charcoal">Coloque seu cardápio em 3D hoje</h2>
          <Button asChild size="lg" className="mt-6"><Link href="/signup">Criar conta grátis</Link></Button>
        </section>
      </main>

      <footer className="bg-brand-charcoal py-10 text-sm text-brand-cream/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 md:flex-row">
          <p className="font-display text-lg font-bold text-brand-cream">Cardápio<span className="text-brand-caramel">AR</span></p>
          <nav aria-label="Rodapé" className="flex gap-6">
            <a href="#planos" className="hover:text-brand-cream">Planos</a>
            <a href="#faq" className="hover:text-brand-cream">FAQ</a>
            <Link href="/login" className="hover:text-brand-cream">Entrar</Link>
          </nav>
          <p>© {new Date().getFullYear()} Cardápio AR</p>
        </div>
      </footer>
    </div>
  );
}
