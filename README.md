# Cardápio AR — SaaS multi-tenant de cardápio digital com Realidade Aumentada

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript · Tailwind v4 · componentes estilo shadcn/ui · Supabase (Postgres + RLS, Auth, Storage, Realtime) · Three.js / React Three Fiber / drei · `<model-viewer>` (WebXR, Scene Viewer, Quick Look) · Stripe ou Mercado Pago.

## Setup

1. Crie um projeto no Supabase e rode a migration:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
   (ou cole `supabase/migrations/20261120000000_initial_schema.sql` no SQL Editor)
2. `cp .env.example .env.local` e preencha as chaves.
3. **Auth → URL Configuration**: Site URL = `NEXT_PUBLIC_SITE_URL`; adicione `${SITE_URL}/auth/confirm` aos Redirect URLs.
4. **Auth → Email Templates** (fluxo SSR recomendado):
   - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
5. Webhooks de pagamento: Stripe → `/api/webhooks/stripe` (eventos `checkout.session.*`, `customer.subscription.*`); Mercado Pago → `/api/webhooks/mercadopago` (tópicos `payment`, `subscription_preapproval`).
6. `npm install && npm run dev`

Tipos completos do banco: `npx supabase gen types typescript --project-id <id> > lib/database.types.ts`.

## Estrutura

```
supabase/migrations/   schema, RLS, RPCs, triggers, storage, realtime, seed de planos
supabase/tests/        smoke test de RLS/RPCs (stubs de auth/storage p/ Postgres puro)
proxy.ts               (ex-middleware no Next 16) renova sessão e protege /dashboard
app/
  page.tsx             landing comercial (planos lidos do banco, "use cache")
  (auth)/              login, signup, forgot/reset-password + Server Actions
  auth/confirm/        verificação de e-mail / recuperação (token_hash ou PKCE)
  onboarding/          cria restaurante via RPC create_restaurant
  dashboard/           visão geral, cardápio, pedidos (KDS), mesas, clientes, relatórios, configurações
  r/[slug]/            cardápio público + /table/[id], /checkout, /order/[token]
  api/                 billing/checkout, orders/pay, webhooks/{stripe,mercadopago}
components/ar/         ProductViewer, ARModelViewer (model-viewer), ModelCanvas (R3F)
contexts/              RestaurantContext (tenant/plano), CartContext (carrinho persistente)
hooks/                 useSubscription, useARSupport, useRealtimeOrders
lib/supabase/          client.ts (browser), server.ts (RSC/actions), proxy.ts, admin.ts (service role)
lib/payments/          interface PaymentProvider + Stripe + Mercado Pago
```

## Segurança multi-tenant (RLS)

- `public.users` é a tabela de pertencimento (usuário ↔ restaurante ↔ papel `owner|manager|staff|kitchen`).
- Funções `SECURITY DEFINER` (`is_member`, `can_manage`, `has_role`, `plan_allows`) são usadas nas policies, chamadas como `(select fn(...))` para avaliar 1x por query e sem recursão de RLS.
- Catálogo (restaurants, categories, products, models_3d, tables) tem leitura pública **apenas** de restaurante ativo e itens ativos; escrita só owner/manager.
- `orders`: o cliente anônimo **não** tem INSERT. Pedidos entram pela RPC `place_order`, que lê preços/adicionais/cupom do banco (o navegador manda só IDs e quantidades). A equipe só pode alterar `status`, `payment_status` e `internal_notes` (GRANT por coluna), e a máquina de estados é validada por trigger.
- Storage: o path começa com `{restaurant_id}/`; policies checam o 1º segmento. Upload de GLB exige plano com AR.
- Limites de plano (nº de produtos/mesas/modelos, AR) são **aplicados no banco** (trigger + policy). A UI só espelha.
- Realtime `postgres_changes` respeita RLS: cada painel só recebe pedidos do próprio restaurante.

Para rodar o teste (Postgres local, sem Supabase):
```bash
createdb t && psql -d t -f supabase/tests/_supabase_stubs.sql -f supabase/migrations/*.sql -f supabase/tests/rls_smoke_test.sql
```

## Módulo 3D/AR

`<ProductViewer />` só carrega quando o cliente toca em "Ver em 3D / AR" (lazy, via `next/dynamic` + import dinâmico do model-viewer).

| Dispositivo | Caminho |
|---|---|
| Android Chrome com ARCore | WebXR `immersive-ar` (hit-test no chão) via `<model-viewer>` |
| Android sem WebXR | Scene Viewer (ARCore) |
| iPhone/iPad | AR Quick Look (ARKit), com USDZ enviado ou gerado do GLB, e banner nativo "Adicionar ao pedido" |
| Desktop / sem AR | R3F + `OrbitControls` (girar/zoom), iluminação local, sombra de contato |

**Escala real:** cada modelo guarda `real_size_m` (ex.: hambúrguer 0,12 m) e `dimensions` (bounding box medido no navegador no upload). O viewer aplica `scale = real_size_m / maior_dimensão` **na criação do elemento**, com `ar-scale="fixed"`, e o prato aparece em tamanho real na mesa. Aplicar a escala na criação evita um bug do model-viewer: alterar `scale` depois do load chama `arRenderer.onUpdateScene()` fora de uma sessão AR e lança erro. Para modelos sem `dimensions`, o componente mede no 1º load (invisível) e recria o elemento já escalado.

Telemetria: `model_view_3d` e `ar_session_start` alimentam o funil "3D/AR → pedido" em Relatórios.

## Pagamentos

`PAYMENT_PROVIDER=stripe|mercadopago`. Assinaturas do SaaS e pagamento online de pedidos usam a mesma interface. **Antes de produção:** para o dinheiro do pedido ir direto ao restaurante, use Stripe Connect ou OAuth do Mercado Pago por restaurante. A estrutura atual cobra na conta da plataforma.

## Pendências conhecidas / próximos passos

- Rate limiting em `place_order` e `analytics_events` (ex.: Vercel Firewall ou contador no Postgres).
- Convite de membros da equipe (tabela `users` + e-mail de convite).
- Acompanhamento do pedido pelo cliente usa polling de 5s (o anon não tem SELECT em `orders`). Para push em tempo real, use Realtime Broadcast com autorização por token.
- Horário de funcionamento (`opening_hours`) é armazenado mas ainda não abre/fecha a loja automaticamente.
