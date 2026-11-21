-- =============================================================================
-- Permissões da Data API. Projetos Supabase novos NÃO concedem acesso automático
-- às tabelas para anon/authenticated. Concedemos o mínimo; o RLS continua
-- filtrando linha a linha (tenant).
-- =============================================================================
grant usage on schema public to anon, authenticated;

-- Visitante (cardápio público): só leitura do catálogo
grant select on public.plans, public.restaurants, public.categories, public.products,
                public.product_images, public.models_3d, public.tables, public.reviews
  to anon;
grant insert on public.analytics_events to anon;

-- Usuário logado (painel): leitura de tudo do próprio tenant (RLS)
grant select on all tables in schema public to authenticated;
grant insert, update, delete on public.restaurants, public.users, public.categories, public.products,
                                public.product_images, public.models_3d, public.tables, public.qr_codes,
                                public.coupons
  to authenticated;
grant update on public.profiles, public.customers, public.reviews to authenticated;
grant update (status, payment_status, internal_notes) on public.orders to authenticated;
grant insert on public.analytics_events to authenticated;

grant usage, select on all sequences in schema public to anon, authenticated;
