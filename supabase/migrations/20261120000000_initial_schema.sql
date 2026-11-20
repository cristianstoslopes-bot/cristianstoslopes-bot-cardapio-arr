-- =============================================================================
-- Cardápio AR — Schema multi-tenant (Supabase / PostgreSQL 15+)
-- -----------------------------------------------------------------------------
-- Princípios:
--   * Toda tabela de negócio carrega `restaurant_id` (tenant key) + índice.
--   * RLS habilitado em TODAS as tabelas. Nenhuma tabela fica "aberta".
--   * Pertencimento ao tenant é resolvido por `public.users` (membros/equipe).
--   * Escritas sensíveis do cliente anônimo (pedido, review) passam por RPCs
--     SECURITY DEFINER que recalculam preços no servidor: o navegador NUNCA
--     define valores monetários.
--   * Limites de plano (AR, nº de produtos...) são aplicados no banco, não só na UI.
--   * Valores monetários em centavos (integer) para evitar erros de ponto flutuante.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.member_role         as enum ('owner', 'manager', 'staff', 'kitchen');
create type public.order_status        as enum ('pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled');
create type public.order_type          as enum ('delivery', 'pickup', 'dine_in');
create type public.payment_method      as enum ('online', 'cash', 'card_on_delivery', 'pix');
create type public.payment_status      as enum ('pending', 'paid', 'failed', 'refunded');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled');
create type public.discount_type       as enum ('percent', 'fixed');

-- -----------------------------------------------------------------------------
-- Utilitário: updated_at automático
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =============================================================================
-- TABELAS
-- =============================================================================

-- Planos comerciais (catálogo global, sem tenant)
create table public.plans (
  id              text primary key,                       -- 'starter' | 'pro' | 'premium'
  name            text not null,
  description     text,
  price_cents     integer not null check (price_cents >= 0),
  currency        text not null default 'BRL',
  interval        text not null default 'month' check (interval in ('month', 'year')),
  -- features: { ar: bool, online_payments: bool, advanced_reports: bool,
  --             max_products: int, max_tables: int, max_models: int, max_staff: int }  (-1 = ilimitado)
  features        jsonb not null default '{}'::jsonb,
  stripe_price_id text,
  mp_plan_id      text,
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Perfil 1:1 com auth.users
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  avatar_url  text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Restaurante = tenant
create table public.restaurants (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'),
  name                text not null check (char_length(name) between 2 and 80),
  description         text,
  logo_url            text,
  cover_url           text,
  phone               text,
  whatsapp            text,
  address             jsonb not null default '{}'::jsonb,
  -- theme: { primary, secondary, accent, background, foreground, radius }
  theme               jsonb not null default jsonb_build_object(
                          'primary',    '#243B32',
                          'secondary',  '#F4EBDD',
                          'accent',     '#D88B48',
                          'background', '#FFFDF9',
                          'foreground', '#1C1C1A'),
  currency            text not null default 'BRL',
  locale              text not null default 'pt-BR',
  timezone            text not null default 'America/Sao_Paulo',
  is_active           boolean not null default true,
  is_open             boolean not null default true,
  accepts_delivery    boolean not null default true,
  accepts_pickup      boolean not null default true,
  accepts_dine_in     boolean not null default true,
  delivery_fee_cents  integer not null default 0 check (delivery_fee_cents >= 0),
  min_order_cents     integer not null default 0 check (min_order_cents >= 0),
  opening_hours       jsonb not null default '{}'::jsonb,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Membros da equipe do restaurante (tabela de pertencimento ao tenant).
-- Um usuário pode pertencer a vários restaurantes (ex.: dono de rede).
create table public.users (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  role           public.member_role not null default 'staff',
  created_at     timestamptz not null default now(),
  unique (restaurant_id, user_id)
);

create table public.categories (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 60),
  description    text,
  position       integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Modelos 3D (GLB/GLTF + USDZ opcional p/ iOS Quick Look)
create table public.models_3d (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants (id) on delete cascade,
  name             text not null,
  glb_path         text not null,          -- caminho no bucket `models-3d`: {restaurant_id}/{uuid}.glb
  usdz_path        text,                   -- opcional (iOS gera automaticamente via model-viewer se ausente)
  poster_path      text,                   -- imagem de pré-carregamento
  file_size_bytes  bigint,
  -- Escala real: maior dimensão do prato em metros (ex.: hambúrguer ≈ 0.12).
  -- O viewer normaliza o modelo para este tamanho → AR com escala aproximada real.
  real_size_m      numeric(5,3) not null default 0.15 check (real_size_m > 0 and real_size_m <= 2),
  -- Bounding box do GLB em unidades do arquivo ({x,y,z}), medido no upload.
  -- Permite aplicar a escala ANTES do load (evita re-layout e um bug do model-viewer
  -- ao alterar `scale` depois do carregamento).
  dimensions       jsonb,
  created_at       timestamptz not null default now()
);

create table public.products (
  id                      uuid primary key default gen_random_uuid(),
  restaurant_id           uuid not null references public.restaurants (id) on delete cascade,
  category_id             uuid references public.categories (id) on delete set null,
  name                    text not null check (char_length(name) between 1 and 100),
  description             text,
  price_cents             integer not null check (price_cents >= 0),
  compare_at_price_cents  integer check (compare_at_price_cents is null or compare_at_price_cents >= 0),
  allergens               text[] not null default '{}',
  tags                    text[] not null default '{}',   -- ex.: 'vegano', 'picante'
  -- addon_groups: [{ id, name, min, max, options: [{ id, name, price_cents }] }]
  addon_groups            jsonb not null default '[]'::jsonb check (jsonb_typeof(addon_groups) = 'array'),
  model_3d_id             uuid references public.models_3d (id) on delete set null,
  image_url               text,                            -- imagem principal (cache de product_images)
  is_available            boolean not null default true,
  is_featured             boolean not null default false,
  position                integer not null default 0,
  prep_time_minutes       integer,
  calories                integer,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table public.product_images (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  product_id     uuid not null references public.products (id) on delete cascade,
  storage_path   text not null,     -- bucket `restaurant-assets`: {restaurant_id}/products/{uuid}.webp
  url            text not null,
  alt            text,
  position       integer not null default 0,
  created_at     timestamptz not null default now()
);

create table public.tables (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  label          text not null,
  seats          integer not null default 4 check (seats > 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (restaurant_id, label)
);

create table public.qr_codes (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  table_id       uuid references public.tables (id) on delete cascade,   -- null = QR geral do cardápio
  target_url     text not null,
  scans          integer not null default 0,
  created_at     timestamptz not null default now()
);
create unique index qr_codes_one_per_table on public.qr_codes (table_id) where table_id is not null;

create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references public.restaurants (id) on delete cascade,
  name               text not null,
  phone              text not null,     -- somente dígitos
  email              text,
  auth_user_id       uuid references auth.users (id) on delete set null,
  total_orders       integer not null default 0,
  total_spent_cents  bigint not null default 0,
  last_order_at      timestamptz,
  created_at         timestamptz not null default now(),
  unique (restaurant_id, phone)
);

create table public.coupons (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants (id) on delete cascade,
  code             text not null check (code ~ '^[A-Z0-9_-]{3,24}$'),
  discount_type    public.discount_type not null,
  discount_value   integer not null check (discount_value > 0),   -- % (1-100) ou centavos
  min_order_cents  integer not null default 0,
  max_uses         integer,
  used_count       integer not null default 0,
  starts_at        timestamptz,
  expires_at       timestamptz,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  unique (restaurant_id, code),
  check (discount_type <> 'percent' or discount_value <= 100)
);

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants (id) on delete cascade,
  number              integer not null,                       -- sequencial por restaurante (#0042)
  customer_id         uuid references public.customers (id) on delete set null,
  table_id            uuid references public.tables (id) on delete set null,
  type                public.order_type not null,
  status              public.order_status not null default 'pending',
  payment_method      public.payment_method not null,
  payment_status      public.payment_status not null default 'pending',
  payment_provider    text,                                   -- 'stripe' | 'mercadopago'
  payment_external_id text,
  subtotal_cents      integer not null check (subtotal_cents >= 0),
  discount_cents      integer not null default 0 check (discount_cents >= 0),
  delivery_fee_cents  integer not null default 0 check (delivery_fee_cents >= 0),
  total_cents         integer not null check (total_cents >= 0),
  coupon_id           uuid references public.coupons (id) on delete set null,
  customer_name       text not null,
  customer_phone      text,
  delivery_address    jsonb,
  notes               text,
  internal_notes      text,
  public_token        uuid not null default gen_random_uuid() unique,  -- acompanhamento anônimo
  accepted_at         timestamptz,
  preparing_at        timestamptz,
  ready_at            timestamptz,
  delivered_at        timestamptz,
  cancelled_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (restaurant_id, number)
);

create table public.order_items (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references public.restaurants (id) on delete cascade,
  order_id            uuid not null references public.orders (id) on delete cascade,
  product_id          uuid references public.products (id) on delete set null,
  product_name        text not null,     -- snapshot (produto pode mudar depois)
  unit_price_cents    integer not null,
  quantity            integer not null check (quantity between 1 and 99),
  addons              jsonb not null default '[]'::jsonb,   -- snapshot [{group, name, price_cents}]
  addons_total_cents  integer not null default 0,
  notes               text,
  total_cents         integer not null,
  created_at          timestamptz not null default now()
);

create table public.reviews (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  order_id       uuid unique references public.orders (id) on delete set null,
  rating         smallint not null check (rating between 1 and 5),
  comment        text check (char_length(comment) <= 1000),
  customer_name  text,
  is_published   boolean not null default true,
  created_at     timestamptz not null default now()
);

create table public.subscriptions (
  id                        uuid primary key default gen_random_uuid(),
  restaurant_id             uuid not null unique references public.restaurants (id) on delete cascade,
  plan_id                   text not null references public.plans (id),
  status                    public.subscription_status not null default 'trialing',
  provider                  text,                 -- 'stripe' | 'mercadopago'
  provider_customer_id      text,
  provider_subscription_id  text unique,
  trial_ends_at             timestamptz,
  current_period_end        timestamptz,
  cancel_at_period_end      boolean not null default false,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create table public.analytics_events (
  id             bigint generated always as identity primary key,
  restaurant_id  uuid not null references public.restaurants (id) on delete cascade,
  event_type     text not null check (event_type in (
                   'menu_view', 'product_view', 'model_view_3d', 'ar_session_start',
                   'add_to_cart', 'checkout_start', 'order_placed', 'qr_scan')),
  product_id     uuid references public.products (id) on delete set null,
  table_id       uuid references public.tables (id) on delete set null,
  session_id     text check (char_length(session_id) <= 64),
  metadata       jsonb not null default '{}'::jsonb check (pg_column_size(metadata) < 2048),
  created_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Índices (todas as queries filtram por restaurant_id)
-- -----------------------------------------------------------------------------
create index on public.users (user_id);
create index on public.categories (restaurant_id, position);
create index on public.models_3d (restaurant_id);
create index on public.products (restaurant_id, category_id, position);
create index on public.product_images (product_id, position);
create index on public.product_images (restaurant_id);
create index on public.tables (restaurant_id);
create index on public.qr_codes (restaurant_id);
create index on public.customers (restaurant_id, last_order_at desc);
create index on public.coupons (restaurant_id);
create index on public.orders (restaurant_id, created_at desc);
create index on public.orders (restaurant_id, status) where status not in ('delivered', 'cancelled');
create index on public.order_items (order_id);
create index on public.order_items (restaurant_id);
create index on public.reviews (restaurant_id, created_at desc);
create index on public.analytics_events (restaurant_id, created_at desc);
create index on public.analytics_events (restaurant_id, event_type, product_id);

-- updated_at triggers
create trigger trg_profiles_updated      before update on public.profiles      for each row execute function public.set_updated_at();
create trigger trg_restaurants_updated   before update on public.restaurants   for each row execute function public.set_updated_at();
create trigger trg_categories_updated    before update on public.categories    for each row execute function public.set_updated_at();
create trigger trg_products_updated      before update on public.products      for each row execute function public.set_updated_at();
create trigger trg_orders_updated        before update on public.orders        for each row execute function public.set_updated_at();
create trigger trg_subscriptions_updated before update on public.subscriptions for each row execute function public.set_updated_at();

-- =============================================================================
-- FUNÇÕES AUXILIARES DE SEGURANÇA
-- SECURITY DEFINER + STABLE: rodam sem recursão de RLS em `users` e são
-- avaliadas uma vez por statement quando chamadas como `(select fn(...))`.
-- =============================================================================

-- O usuário logado é membro do restaurante?
create or replace function public.is_member(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.users u
    where u.restaurant_id = p_restaurant_id and u.user_id = auth.uid()
  );
$$;

-- O usuário tem um dos papéis informados?
create or replace function public.has_role(p_restaurant_id uuid, p_roles public.member_role[])
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.users u
    where u.restaurant_id = p_restaurant_id and u.user_id = auth.uid() and u.role = any (p_roles)
  );
$$;

-- Atalho: owner ou manager (quem pode editar cardápio/configurações)
create or replace function public.can_manage(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.has_role(p_restaurant_id, array['owner', 'manager']::public.member_role[]);
$$;

-- Versão para Storage: primeiro segmento do path é o restaurant_id em texto.
-- Não faz cast (um path malformado simplesmente retorna false).
create or replace function public.can_manage_path(p_object_name text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.users u
    where u.restaurant_id::text = split_part(p_object_name, '/', 1)
      and u.user_id = auth.uid()
      and u.role in ('owner', 'manager')
  );
$$;

-- Restaurante visível publicamente (cardápio /r/{slug})?
create or replace function public.is_public_restaurant(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.restaurants r where r.id = p_restaurant_id and r.is_active);
$$;

-- Assinatura vigente do restaurante (trial válido ou ativa)
create or replace function public.active_plan_features(p_restaurant_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select p.features
    from public.subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.restaurant_id = p_restaurant_id
      and (
        (s.status = 'active')
        or (s.status = 'past_due' and coalesce(s.current_period_end, now()) > now() - interval '3 days')  -- carência
        or (s.status = 'trialing' and coalesce(s.trial_ends_at, now()) > now())
      )
  ), '{}'::jsonb);
$$;

create or replace function public.plan_allows(p_restaurant_id uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((public.active_plan_features(p_restaurant_id) ->> p_feature)::boolean, false);
$$;

create or replace function public.plan_limit(p_restaurant_id uuid, p_key text)
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((public.active_plan_features(p_restaurant_id) ->> p_key)::integer, 0);  -- -1 = ilimitado
$$;

-- =============================================================================
-- TRIGGERS DE REGRA DE NEGÓCIO
-- =============================================================================

-- Cria profile ao cadastrar usuário no Supabase Auth
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Limites de plano aplicados no banco (a UI apenas espelha)
create or replace function public.enforce_plan_limits()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_key   text;
  v_limit integer;
  v_count integer;
begin
  v_key := case tg_table_name
             when 'products'  then 'max_products'
             when 'tables'    then 'max_tables'
             when 'models_3d' then 'max_models'
             when 'users'     then 'max_staff'
           end;

  if tg_table_name = 'models_3d' and not public.plan_allows(new.restaurant_id, 'ar') then
    raise exception 'PLAN_FEATURE_REQUIRED:ar' using errcode = 'P0001',
      hint = 'Modelos 3D/AR estão disponíveis a partir do plano Pro.';
  end if;

  v_limit := public.plan_limit(new.restaurant_id, v_key);
  if v_limit = -1 then return new; end if;

  execute format('select count(*) from public.%I where restaurant_id = $1', tg_table_name)
    into v_count using new.restaurant_id;

  if v_count >= v_limit then
    raise exception 'PLAN_LIMIT_REACHED:%', v_key using errcode = 'P0001',
      hint = format('Seu plano permite até %s itens. Faça upgrade para continuar.', v_limit);
  end if;
  return new;
end $$;

create trigger trg_products_limit  before insert on public.products  for each row execute function public.enforce_plan_limits();
create trigger trg_tables_limit    before insert on public.tables    for each row execute function public.enforce_plan_limits();
create trigger trg_models_limit    before insert on public.models_3d for each row execute function public.enforce_plan_limits();

-- Produto só pode apontar para categoria/modelo do MESMO restaurante
-- (FK sozinha não garante isolamento entre tenants).
create or replace function public.enforce_product_tenant()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.category_id is not null and not exists (
       select 1 from public.categories c where c.id = new.category_id and c.restaurant_id = new.restaurant_id) then
    raise exception 'Categoria não pertence a este restaurante';
  end if;
  if new.model_3d_id is not null then
    if not exists (select 1 from public.models_3d m where m.id = new.model_3d_id and m.restaurant_id = new.restaurant_id) then
      raise exception 'Modelo 3D não pertence a este restaurante';
    end if;
    if (tg_op = 'INSERT' or new.model_3d_id is distinct from old.model_3d_id)
       and not public.plan_allows(new.restaurant_id, 'ar') then
      raise exception 'PLAN_FEATURE_REQUIRED:ar' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger trg_products_tenant before insert or update on public.products
  for each row execute function public.enforce_product_tenant();

create or replace function public.enforce_image_tenant()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.products p where p.id = new.product_id and p.restaurant_id = new.restaurant_id) then
    raise exception 'Produto não pertence a este restaurante';
  end if;
  return new;
end $$;

create trigger trg_product_images_tenant before insert or update on public.product_images
  for each row execute function public.enforce_image_tenant();

-- Número sequencial do pedido por restaurante (com lock transacional)
create or replace function public.assign_order_number()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtext('order_number:' || new.restaurant_id::text));
  select coalesce(max(number), 0) + 1 into new.number
  from public.orders where restaurant_id = new.restaurant_id;
  return new;
end $$;

create trigger trg_orders_number before insert on public.orders
  for each row execute function public.assign_order_number();

-- Máquina de estados do pedido + timestamps de cada etapa
create or replace function public.validate_order_transition()
returns trigger language plpgsql as $$
declare
  allowed jsonb := '{
    "pending":          ["accepted", "cancelled"],
    "accepted":         ["preparing", "cancelled"],
    "preparing":        ["ready", "cancelled"],
    "ready":            ["out_for_delivery", "delivered", "cancelled"],
    "out_for_delivery": ["delivered"],
    "delivered":        [],
    "cancelled":        []
  }';
begin
  if new.status is distinct from old.status then
    if not (allowed -> old.status::text) ? new.status::text then
      raise exception 'Transição de status inválida: % → %', old.status, new.status;
    end if;
    case new.status
      when 'accepted'  then new.accepted_at  := now();
      when 'preparing' then new.preparing_at := now();
      when 'ready'     then new.ready_at     := now();
      when 'delivered' then new.delivered_at := now();
      when 'cancelled' then new.cancelled_at := now();
      else null;
    end case;
  end if;
  return new;
end $$;

create trigger trg_orders_transition before update on public.orders
  for each row execute function public.validate_order_transition();

-- =============================================================================
-- RPCs (API do banco)
-- =============================================================================

-- Onboarding: cria restaurante + vínculo owner + trial de 14 dias (Pro, p/ testar AR)
create or replace function public.create_restaurant(p_name text, p_slug text)
returns public.restaurants
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_restaurant public.restaurants;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;

  insert into public.restaurants (name, slug, created_by)
  values (trim(p_name), lower(trim(p_slug)), auth.uid())
  returning * into v_restaurant;

  insert into public.users (restaurant_id, user_id, role)
  values (v_restaurant.id, auth.uid(), 'owner');

  insert into public.subscriptions (restaurant_id, plan_id, status, trial_ends_at)
  values (v_restaurant.id, 'pro', 'trialing', now() + interval '14 days');

  insert into public.qr_codes (restaurant_id, target_url)
  values (v_restaurant.id, '/r/' || v_restaurant.slug);

  return v_restaurant;
end $$;

-- Validação de cupom (pública, sem expor a tabela coupons)
create or replace function public.validate_coupon(p_restaurant_id uuid, p_code text, p_subtotal_cents integer)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  c public.coupons;
  v_discount integer;
begin
  select * into c from public.coupons
  where restaurant_id = p_restaurant_id and code = upper(trim(p_code)) and is_active
    and (starts_at is null or starts_at <= now())
    and (expires_at is null or expires_at > now())
    and (max_uses is null or used_count < max_uses);

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'Cupom inválido ou expirado');
  end if;
  if p_subtotal_cents < c.min_order_cents then
    return jsonb_build_object('valid', false, 'reason',
      format('Pedido mínimo para este cupom: R$ %s', to_char(c.min_order_cents / 100.0, 'FM999990D00')));
  end if;

  v_discount := case c.discount_type
                  when 'percent' then round(p_subtotal_cents * c.discount_value / 100.0)::int
                  else least(c.discount_value, p_subtotal_cents)
                end;
  return jsonb_build_object('valid', true, 'code', c.code, 'discount_cents', v_discount);
end $$;

-- Criação de pedido (anônimo ou logado).
-- Payload:
-- {
--   "type": "delivery|pickup|dine_in", "table_id": uuid?, "payment_method": "...",
--   "customer": { "name", "phone", "email"? }, "address": {...}?, "notes"?, "coupon_code"?,
--   "items": [{ "product_id", "quantity", "notes"?, "addons": [{ "group_id", "option_ids": [] }] }]
-- }
-- Todos os preços são lidos de `products` — o cliente só envia IDs e quantidades.
create or replace function public.place_order(p_restaurant_id uuid, p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  r              public.restaurants;
  v_type         public.order_type;
  v_method       public.payment_method;
  v_item         jsonb;
  v_product      public.products;
  v_group        jsonb;
  v_selected     jsonb;
  v_opt          jsonb;
  v_qty          integer;
  v_addons_total integer;
  v_addons_snap  jsonb;
  v_matched      integer;
  v_subtotal     integer := 0;
  v_discount     integer := 0;
  v_fee          integer := 0;
  v_total        integer;
  v_items        jsonb := '[]'::jsonb;
  v_coupon       public.coupons;
  v_customer_id  uuid;
  v_phone        text;
  v_name         text;
  v_table_id     uuid;
  v_order        public.orders;
begin
  select * into r from public.restaurants where id = p_restaurant_id and is_active;
  if not found then raise exception 'Restaurante indisponível'; end if;
  if not r.is_open then raise exception 'O restaurante está fechado no momento'; end if;

  v_type   := (p_payload ->> 'type')::public.order_type;
  v_method := (p_payload ->> 'payment_method')::public.payment_method;

  if (v_type = 'delivery' and not r.accepts_delivery)
     or (v_type = 'pickup' and not r.accepts_pickup)
     or (v_type = 'dine_in' and not r.accepts_dine_in) then
    raise exception 'Modalidade de pedido não aceita por este restaurante';
  end if;

  if v_method = 'online' and not public.plan_allows(r.id, 'online_payments') then
    raise exception 'Pagamento online não disponível';
  end if;

  v_name  := left(trim(coalesce(p_payload #>> '{customer,name}', '')), 80);
  v_phone := regexp_replace(coalesce(p_payload #>> '{customer,phone}', ''), '\D', '', 'g');
  if char_length(v_name) < 2 then raise exception 'Informe seu nome'; end if;
  if v_type <> 'dine_in' and char_length(v_phone) not between 10 and 13 then
    raise exception 'Telefone inválido';
  end if;

  if v_type = 'dine_in' then
    v_table_id := nullif(p_payload ->> 'table_id', '')::uuid;
    if v_table_id is null or not exists (
      select 1 from public.tables t where t.id = v_table_id and t.restaurant_id = r.id and t.is_active) then
      raise exception 'Mesa inválida';
    end if;
  end if;

  if v_type = 'delivery' and coalesce(p_payload #>> '{address,street}', '') = '' then
    raise exception 'Endereço de entrega obrigatório';
  end if;

  if jsonb_typeof(p_payload -> 'items') <> 'array' or jsonb_array_length(p_payload -> 'items') = 0 then
    raise exception 'Carrinho vazio';
  end if;
  if jsonb_array_length(p_payload -> 'items') > 50 then
    raise exception 'Itens demais no pedido';
  end if;

  -- ---- Itens: preço sempre do banco ----
  for v_item in select * from jsonb_array_elements(p_payload -> 'items') loop
    select * into v_product from public.products
    where id = (v_item ->> 'product_id')::uuid and restaurant_id = r.id and is_available;
    if not found then raise exception 'Produto indisponível: %', v_item ->> 'product_id'; end if;

    v_qty := greatest(1, least(99, coalesce((v_item ->> 'quantity')::int, 1)));
    v_addons_total := 0;
    v_addons_snap  := '[]'::jsonb;

    for v_group in select * from jsonb_array_elements(v_product.addon_groups) loop
      select sel -> 'option_ids' into v_selected
      from jsonb_array_elements(coalesce(v_item -> 'addons', '[]'::jsonb)) sel
      where sel ->> 'group_id' = v_group ->> 'id'
      limit 1;
      v_selected := coalesce(v_selected, '[]'::jsonb);

      if jsonb_array_length(v_selected) < coalesce((v_group ->> 'min')::int, 0)
         or jsonb_array_length(v_selected) > coalesce((v_group ->> 'max')::int, 99) then
        raise exception 'Seleção inválida em "%" (%)', v_group ->> 'name', v_product.name;
      end if;

      v_matched := 0;
      for v_opt in
        select o from jsonb_array_elements(v_group -> 'options') o
        where o ->> 'id' in (select jsonb_array_elements_text(v_selected))
      loop
        v_matched := v_matched + 1;
        v_addons_total := v_addons_total + coalesce((v_opt ->> 'price_cents')::int, 0);
        v_addons_snap  := v_addons_snap || jsonb_build_object(
          'group', v_group ->> 'name', 'name', v_opt ->> 'name',
          'price_cents', coalesce((v_opt ->> 'price_cents')::int, 0));
      end loop;
      if v_matched <> jsonb_array_length(v_selected) then
        raise exception 'Adicional inválido em %', v_product.name;
      end if;
    end loop;

    v_subtotal := v_subtotal + (v_product.price_cents + v_addons_total) * v_qty;
    v_items := v_items || jsonb_build_object(
      'product_id', v_product.id, 'product_name', v_product.name,
      'unit_price_cents', v_product.price_cents, 'quantity', v_qty,
      'addons', v_addons_snap, 'addons_total_cents', v_addons_total,
      'notes', left(v_item ->> 'notes', 200),
      'total_cents', (v_product.price_cents + v_addons_total) * v_qty);
  end loop;

  if v_subtotal < r.min_order_cents and v_type = 'delivery' then
    raise exception 'Pedido mínimo para delivery não atingido';
  end if;

  -- ---- Cupom (com lock para não estourar max_uses em concorrência) ----
  if coalesce(p_payload ->> 'coupon_code', '') <> '' then
    select * into v_coupon from public.coupons
    where restaurant_id = r.id and code = upper(trim(p_payload ->> 'coupon_code')) and is_active
      and (starts_at is null or starts_at <= now())
      and (expires_at is null or expires_at > now())
      and (max_uses is null or used_count < max_uses)
      and min_order_cents <= v_subtotal
    for update;
    if not found then raise exception 'Cupom inválido ou expirado'; end if;

    v_discount := case v_coupon.discount_type
                    when 'percent' then round(v_subtotal * v_coupon.discount_value / 100.0)::int
                    else least(v_coupon.discount_value, v_subtotal)
                  end;
    update public.coupons set used_count = used_count + 1 where id = v_coupon.id;
  end if;

  if v_type = 'delivery' then v_fee := r.delivery_fee_cents; end if;
  v_total := v_subtotal - v_discount + v_fee;

  -- ---- Cliente (CRM por restaurante) ----
  if char_length(v_phone) >= 10 then
    insert into public.customers (restaurant_id, name, phone, email, auth_user_id,
                                  total_orders, total_spent_cents, last_order_at)
    values (r.id, v_name, v_phone, nullif(p_payload #>> '{customer,email}', ''), auth.uid(), 1, v_total, now())
    on conflict (restaurant_id, phone) do update
      set name = excluded.name,
          email = coalesce(excluded.email, public.customers.email),
          total_orders = public.customers.total_orders + 1,
          total_spent_cents = public.customers.total_spent_cents + excluded.total_spent_cents,
          last_order_at = now()
    returning id into v_customer_id;
  end if;

  insert into public.orders (
    restaurant_id, customer_id, table_id, type, payment_method,
    subtotal_cents, discount_cents, delivery_fee_cents, total_cents, coupon_id,
    customer_name, customer_phone, delivery_address, notes, number)
  values (
    r.id, v_customer_id, v_table_id, v_type, v_method,
    v_subtotal, v_discount, v_fee, v_total, v_coupon.id,
    v_name, nullif(v_phone, ''), case when v_type = 'delivery' then p_payload -> 'address' end,
    left(p_payload ->> 'notes', 500), 0)
  returning * into v_order;

  insert into public.order_items (restaurant_id, order_id, product_id, product_name, unit_price_cents,
                                  quantity, addons, addons_total_cents, notes, total_cents)
  select r.id, v_order.id, (i ->> 'product_id')::uuid, i ->> 'product_name', (i ->> 'unit_price_cents')::int,
         (i ->> 'quantity')::int, i -> 'addons', (i ->> 'addons_total_cents')::int, i ->> 'notes', (i ->> 'total_cents')::int
  from jsonb_array_elements(v_items) i;

  insert into public.analytics_events (restaurant_id, event_type, table_id, session_id, metadata)
  values (r.id, 'order_placed', v_table_id, left(p_payload ->> 'session_id', 64),
          jsonb_build_object('order_id', v_order.id, 'total_cents', v_total));

  return jsonb_build_object(
    'id', v_order.id, 'number', v_order.number,
    'public_token', v_order.public_token, 'total_cents', v_order.total_cents);
end $$;

-- Acompanhamento do pedido pelo cliente (sem login) via token secreto
create or replace function public.get_order_by_token(p_token uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', o.id, 'number', o.number, 'status', o.status, 'type', o.type,
    'payment_method', o.payment_method, 'payment_status', o.payment_status,
    'subtotal_cents', o.subtotal_cents, 'discount_cents', o.discount_cents,
    'delivery_fee_cents', o.delivery_fee_cents, 'total_cents', o.total_cents,
    'customer_name', o.customer_name, 'created_at', o.created_at,
    'accepted_at', o.accepted_at, 'ready_at', o.ready_at, 'delivered_at', o.delivered_at,
    'restaurant', jsonb_build_object('name', r.name, 'slug', r.slug, 'whatsapp', r.whatsapp),
    'has_review', exists (select 1 from public.reviews rv where rv.order_id = o.id),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_name', i.product_name, 'quantity', i.quantity,
        'addons', i.addons, 'total_cents', i.total_cents, 'notes', i.notes) order by i.created_at)
      from public.order_items i where i.order_id = o.id), '[]'::jsonb))
  from public.orders o
  join public.restaurants r on r.id = o.restaurant_id
  where o.public_token = p_token;
$$;

-- Scan de QR da mesa: incrementa contador + evento (anon não tem UPDATE em qr_codes)
create or replace function public.register_qr_scan(p_table_id uuid, p_session_id text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_restaurant_id uuid;
begin
  select t.restaurant_id into v_restaurant_id
  from public.tables t join public.restaurants r on r.id = t.restaurant_id
  where t.id = p_table_id and t.is_active and r.is_active;
  if v_restaurant_id is null then return; end if;

  update public.qr_codes set scans = scans + 1 where table_id = p_table_id;
  insert into public.analytics_events (restaurant_id, event_type, table_id, session_id)
  values (v_restaurant_id, 'qr_scan', p_table_id, left(p_session_id, 64));
end $$;

-- Avaliação: só quem tem o token de um pedido ENTREGUE pode avaliar (1x)
create or replace function public.submit_review(p_token uuid, p_rating smallint, p_comment text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.orders;
begin
  select * into o from public.orders where public_token = p_token and status = 'delivered';
  if not found then raise exception 'Pedido não encontrado ou ainda não entregue'; end if;
  insert into public.reviews (restaurant_id, order_id, rating, comment, customer_name)
  values (o.restaurant_id, o.id, p_rating, left(p_comment, 1000), o.customer_name);
end $$;

-- Reordenação em lote (drag-and-drop). SECURITY INVOKER: RLS de UPDATE se aplica.
create or replace function public.reorder_categories(p_restaurant_id uuid, p_ids uuid[])
returns void language sql security invoker as $$
  update public.categories c
  set position = array_position(p_ids, c.id)
  where c.restaurant_id = p_restaurant_id and c.id = any (p_ids);
$$;

create or replace function public.reorder_products(p_restaurant_id uuid, p_category_id uuid, p_ids uuid[])
returns void language sql security invoker as $$
  update public.products p
  set position = array_position(p_ids, p.id), category_id = p_category_id
  where p.restaurant_id = p_restaurant_id and p.id = any (p_ids);
$$;

-- Métricas do dashboard. SECURITY INVOKER: RLS limita aos dados do tenant.
create or replace function public.dashboard_metrics(p_restaurant_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security invoker as $$
declare
  result jsonb;
begin
  if not public.is_member(p_restaurant_id) then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  with o as (
    select * from public.orders
    where restaurant_id = p_restaurant_id and created_at >= p_from and created_at < p_to
  ),
  ok as (select * from o where status <> 'cancelled'),
  ev as (
    select event_type, count(*) as n, count(distinct session_id) as sessions
    from public.analytics_events
    where restaurant_id = p_restaurant_id and created_at >= p_from and created_at < p_to
    group by event_type
  )
  select jsonb_build_object(
    'revenue_cents',   coalesce((select sum(total_cents) from ok), 0),
    'orders_count',    (select count(*) from ok),
    'cancelled_count', (select count(*) from o where status = 'cancelled'),
    'avg_ticket_cents', coalesce((select round(avg(total_cents)) from ok), 0),
    'by_type', coalesce((select jsonb_object_agg(type, n) from (select type, count(*) n from ok group by type) t), '{}'),
    'events',  coalesce((select jsonb_object_agg(event_type, jsonb_build_object('count', n, 'sessions', sessions)) from ev), '{}'),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'revenue_cents', rev, 'orders', n) order by d)
      from (select date_trunc('day', created_at)::date d, sum(total_cents) rev, count(*) n from ok group by 1) x), '[]'),
    'top_products', coalesce((
      select jsonb_agg(t) from (
        select i.product_name as name, sum(i.quantity) as quantity, sum(i.total_cents) as revenue_cents
        from public.order_items i join ok on ok.id = i.order_id
        group by i.product_name order by sum(i.quantity) desc limit 5) t), '[]'),
    -- Conversão 3D/AR → pedido: sessões que viram um modelo e depois fizeram pedido
    'ar_conversion', (
      select jsonb_build_object(
        'viewed_3d', count(distinct a.session_id),
        'ordered',   count(distinct a.session_id) filter (where exists (
          select 1 from public.analytics_events b
          where b.restaurant_id = p_restaurant_id and b.session_id = a.session_id
            and b.event_type = 'order_placed' and b.created_at >= a.created_at)))
      from public.analytics_events a
      where a.restaurant_id = p_restaurant_id and a.created_at >= p_from and a.created_at < p_to
        and a.event_type in ('model_view_3d', 'ar_session_start') and a.session_id is not null)
  ) into result;

  return result;
end $$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.plans            enable row level security;
alter table public.profiles         enable row level security;
alter table public.restaurants      enable row level security;
alter table public.users            enable row level security;
alter table public.categories       enable row level security;
alter table public.models_3d        enable row level security;
alter table public.products         enable row level security;
alter table public.product_images   enable row level security;
alter table public.tables           enable row level security;
alter table public.qr_codes         enable row level security;
alter table public.customers        enable row level security;
alter table public.coupons          enable row level security;
alter table public.orders           enable row level security;
alter table public.order_items      enable row level security;
alter table public.reviews          enable row level security;
alter table public.subscriptions    enable row level security;
alter table public.analytics_events enable row level security;

-- plans: catálogo público, somente leitura (escrita só via service_role)
create policy "plans: leitura pública" on public.plans
  for select to anon, authenticated using (is_active);

-- profiles: o próprio usuário + colegas do mesmo restaurante (tela de equipe)
create policy "profiles: ler o próprio ou de colegas" on public.profiles
  for select to authenticated using (
    id = (select auth.uid())
    or exists (
      select 1 from public.users me join public.users other on other.restaurant_id = me.restaurant_id
      where me.user_id = (select auth.uid()) and other.user_id = profiles.id)
  );
create policy "profiles: atualizar o próprio" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- restaurants: vitrine pública (cardápio) + membros; criação só via RPC create_restaurant
create policy "restaurants: leitura pública de ativos" on public.restaurants
  for select to anon, authenticated using (is_active or (select public.is_member(id)));
create policy "restaurants: owner/manager atualizam" on public.restaurants
  for update to authenticated using ((select public.can_manage(id))) with check ((select public.can_manage(id)));
create policy "restaurants: owner exclui" on public.restaurants
  for delete to authenticated using ((select public.has_role(id, array['owner']::public.member_role[])));

-- users (equipe): membros veem a equipe; somente owner gerencia
create policy "users: membros veem a equipe" on public.users
  for select to authenticated using ((select public.is_member(restaurant_id)));
create policy "users: owner adiciona" on public.users
  for insert to authenticated with check ((select public.has_role(restaurant_id, array['owner']::public.member_role[])));
create policy "users: owner altera" on public.users
  for update to authenticated
  using ((select public.has_role(restaurant_id, array['owner']::public.member_role[])))
  with check ((select public.has_role(restaurant_id, array['owner']::public.member_role[])));
create policy "users: owner remove (exceto a si mesmo)" on public.users
  for delete to authenticated
  using ((select public.has_role(restaurant_id, array['owner']::public.member_role[])) and user_id <> (select auth.uid()));

-- Padrão "catálogo": leitura pública se o restaurante está ativo (e item ativo);
-- membros leem tudo; owner/manager escrevem.
create policy "categories: leitura pública" on public.categories
  for select to anon, authenticated
  using ((is_active and (select public.is_public_restaurant(restaurant_id))) or (select public.is_member(restaurant_id)));
create policy "categories: gestão" on public.categories
  for all to authenticated
  using ((select public.can_manage(restaurant_id))) with check ((select public.can_manage(restaurant_id)));

create policy "products: leitura pública" on public.products
  for select to anon, authenticated
  using ((is_available and (select public.is_public_restaurant(restaurant_id))) or (select public.is_member(restaurant_id)));
create policy "products: gestão" on public.products
  for all to authenticated
  using ((select public.can_manage(restaurant_id))) with check ((select public.can_manage(restaurant_id)));

create policy "product_images: leitura pública" on public.product_images
  for select to anon, authenticated
  using ((select public.is_public_restaurant(restaurant_id)) or (select public.is_member(restaurant_id)));
create policy "product_images: gestão" on public.product_images
  for all to authenticated
  using ((select public.can_manage(restaurant_id))) with check ((select public.can_manage(restaurant_id)));

create policy "models_3d: leitura pública" on public.models_3d
  for select to anon, authenticated
  using ((select public.is_public_restaurant(restaurant_id)) or (select public.is_member(restaurant_id)));
-- INSERT exige plano com AR (também validado por trigger)
create policy "models_3d: gestão (insert com plano AR)" on public.models_3d
  for insert to authenticated
  with check ((select public.can_manage(restaurant_id)) and (select public.plan_allows(restaurant_id, 'ar')));
create policy "models_3d: gestão (update)" on public.models_3d
  for update to authenticated
  using ((select public.can_manage(restaurant_id))) with check ((select public.can_manage(restaurant_id)));
create policy "models_3d: gestão (delete)" on public.models_3d
  for delete to authenticated using ((select public.can_manage(restaurant_id)));

-- tables: o cliente que escaneia o QR precisa ler o rótulo da mesa
create policy "tables: leitura pública de mesas ativas" on public.tables
  for select to anon, authenticated
  using ((is_active and (select public.is_public_restaurant(restaurant_id))) or (select public.is_member(restaurant_id)));
create policy "tables: gestão" on public.tables
  for all to authenticated
  using ((select public.can_manage(restaurant_id))) with check ((select public.can_manage(restaurant_id)));

create policy "qr_codes: membros leem" on public.qr_codes
  for select to authenticated using ((select public.is_member(restaurant_id)));
create policy "qr_codes: gestão" on public.qr_codes
  for all to authenticated
  using ((select public.can_manage(restaurant_id))) with check ((select public.can_manage(restaurant_id)));

-- customers: dados pessoais — somente equipe; criação via place_order
create policy "customers: membros leem" on public.customers
  for select to authenticated using ((select public.is_member(restaurant_id)));
create policy "customers: gestão atualiza" on public.customers
  for update to authenticated
  using ((select public.can_manage(restaurant_id))) with check ((select public.can_manage(restaurant_id)));

create policy "coupons: membros leem" on public.coupons
  for select to authenticated using ((select public.is_member(restaurant_id)));
create policy "coupons: gestão" on public.coupons
  for all to authenticated
  using ((select public.can_manage(restaurant_id))) with check ((select public.can_manage(restaurant_id)));

-- orders: toda a equipe (inclui cozinha) lê e muda status. INSERT só via place_order.
-- Privilégio por coluna (abaixo) impede que a equipe altere valores do pedido.
create policy "orders: membros leem" on public.orders
  for select to authenticated using ((select public.is_member(restaurant_id)));
create policy "orders: membros atualizam status" on public.orders
  for update to authenticated
  using ((select public.is_member(restaurant_id))) with check ((select public.is_member(restaurant_id)));

create policy "order_items: membros leem" on public.order_items
  for select to authenticated using ((select public.is_member(restaurant_id)));

create policy "reviews: leitura pública das publicadas" on public.reviews
  for select to anon, authenticated using (is_published or (select public.is_member(restaurant_id)));
create policy "reviews: gestão modera" on public.reviews
  for update to authenticated
  using ((select public.can_manage(restaurant_id))) with check ((select public.can_manage(restaurant_id)));

-- subscriptions: leitura p/ membros; escrita somente via webhook (service_role ignora RLS)
create policy "subscriptions: membros leem" on public.subscriptions
  for select to authenticated using ((select public.is_member(restaurant_id)));

-- analytics: qualquer visitante registra eventos de restaurante ativo; só membros leem
create policy "analytics: registrar evento" on public.analytics_events
  for insert to anon, authenticated
  with check ((select public.is_public_restaurant(restaurant_id)) and event_type <> 'order_placed');
create policy "analytics: membros leem" on public.analytics_events
  for select to authenticated using ((select public.is_member(restaurant_id)));

-- -----------------------------------------------------------------------------
-- Privilégios por coluna: a equipe só pode alterar estes campos do pedido
-- -----------------------------------------------------------------------------
revoke insert, update, delete on public.orders from anon, authenticated;
grant update (status, payment_status, internal_notes) on public.orders to authenticated;
revoke insert, update, delete on public.order_items, public.customers, public.subscriptions, public.plans from anon;
revoke insert, update, delete on public.order_items, public.subscriptions, public.plans from authenticated;

-- RPCs: execução explícita
revoke execute on all functions in schema public from public, anon;
grant execute on function public.place_order(uuid, jsonb)                to anon, authenticated;
grant execute on function public.get_order_by_token(uuid)                to anon, authenticated;
grant execute on function public.register_qr_scan(uuid, text)            to anon, authenticated;
grant execute on function public.submit_review(uuid, smallint, text)     to anon, authenticated;
grant execute on function public.validate_coupon(uuid, text, integer)    to anon, authenticated;
grant execute on function public.is_public_restaurant(uuid)              to anon, authenticated;
grant execute on function public.is_member(uuid)                         to anon, authenticated;  -- usado nas policies públicas (retorna false p/ anon)
grant execute on function public.has_role(uuid, public.member_role[])    to authenticated;
grant execute on function public.can_manage(uuid)                        to authenticated;
grant execute on function public.can_manage_path(text)                   to authenticated;
grant execute on function public.plan_allows(uuid, text)                 to anon, authenticated;
grant execute on function public.plan_limit(uuid, text)                  to authenticated;
grant execute on function public.active_plan_features(uuid)              to anon, authenticated;
grant execute on function public.create_restaurant(text, text)           to authenticated;
grant execute on function public.reorder_categories(uuid, uuid[])        to authenticated;
grant execute on function public.reorder_products(uuid, uuid, uuid[])    to authenticated;
grant execute on function public.dashboard_metrics(uuid, timestamptz, timestamptz) to authenticated;

-- =============================================================================
-- REALTIME — postgres_changes respeita RLS: cada painel só recebe o próprio tenant
-- =============================================================================
alter publication supabase_realtime add table public.orders;
alter table public.orders replica identity full;   -- payload `old` completo em UPDATE

-- =============================================================================
-- STORAGE
-- Convenção de path: {restaurant_id}/...  → o 1º segmento define o tenant.
-- Buckets públicos para leitura (CDN). AR nativo (Scene Viewer/Quick Look)
-- precisa de URL pública acessível pelo app do sistema operacional.
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('restaurant-assets', 'restaurant-assets', true, 5 * 1024 * 1024,
   array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']),
  ('models-3d', 'models-3d', true, 25 * 1024 * 1024,
   array['model/gltf-binary', 'model/gltf+json', 'model/vnd.usdz+zip', 'application/octet-stream', 'image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "assets: gestão faz upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'restaurant-assets' and public.can_manage_path(name));
create policy "assets: gestão atualiza" on storage.objects
  for update to authenticated
  using (bucket_id = 'restaurant-assets' and public.can_manage_path(name));
create policy "assets: gestão remove" on storage.objects
  for delete to authenticated
  using (bucket_id = 'restaurant-assets' and public.can_manage_path(name));

create policy "models: upload exige plano AR" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'models-3d'
    and public.can_manage_path(name)
    and exists (
      select 1 from public.restaurants r
      where r.id::text = split_part(name, '/', 1) and public.plan_allows(r.id, 'ar'))
  );
create policy "models: gestão atualiza" on storage.objects
  for update to authenticated
  using (bucket_id = 'models-3d' and public.can_manage_path(name));
create policy "models: gestão remove" on storage.objects
  for delete to authenticated
  using (bucket_id = 'models-3d' and public.can_manage_path(name));

-- =============================================================================
-- SEED: planos
-- =============================================================================
insert into public.plans (id, name, description, price_cents, sort_order, features) values
  ('starter', 'Starter', 'Cardápio digital com pedidos e QR Code', 7900, 1,
   '{"ar": false, "online_payments": false, "advanced_reports": false,
     "max_products": 60, "max_tables": 10, "max_models": 0, "max_staff": 2}'),
  ('pro', 'Pro', 'Experiência 3D/AR que aumenta o ticket médio', 14900, 2,
   '{"ar": true, "online_payments": true, "advanced_reports": true,
     "max_products": 300, "max_tables": 50, "max_models": 30, "max_staff": 10}'),
  ('premium', 'Premium', 'Tudo ilimitado + suporte prioritário', 29900, 3,
   '{"ar": true, "online_payments": true, "advanced_reports": true,
     "max_products": -1, "max_tables": -1, "max_models": -1, "max_staff": -1}')
on conflict (id) do update set features = excluded.features, price_cents = excluded.price_cents;
