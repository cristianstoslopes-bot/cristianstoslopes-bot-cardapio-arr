-- =============================================================================
-- Hardening de segurança (auditoria 21/11/2026). Rodar no SQL Editor do Supabase.
-- =============================================================================

-- [MÉDIA] SVG pode carregar <script> (XSS no domínio do Storage). Só raster.
update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
where id = 'restaurant-assets';

-- [MÉDIA] Abuso de trial: cada conta podia criar restaurantes ilimitados com Pro grátis.
create or replace function public.create_restaurant(p_name text, p_slug text)
returns public.restaurants
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_restaurant public.restaurants;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado' using errcode = '28000';
  end if;
  if (select count(*) from public.restaurants where created_by = auth.uid()) >= 3 then
    raise exception 'Limite de restaurantes por conta atingido. Fale com o suporte.';
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

-- [ALTA] place_order é público: sem limite, um robô podia inundar a cozinha de
-- pedidos falsos. Limite por telefone e por mesa + tamanho do endereço.
create or replace function public.throttle_orders()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.delivery_address is not null and pg_column_size(new.delivery_address) > 2048 then
    raise exception 'Endereço inválido';
  end if;
  if new.customer_phone is not null and (
    select count(*) from public.orders
    where restaurant_id = new.restaurant_id and customer_phone = new.customer_phone
      and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Muitos pedidos em pouco tempo. Aguarde alguns minutos.';
  end if;
  if new.table_id is not null and (
    select count(*) from public.orders
    where table_id = new.table_id and created_at > now() - interval '10 minutes') >= 15 then
    raise exception 'Muitos pedidos para esta mesa. Chame um atendente.';
  end if;
  if (select count(*) from public.orders
      where restaurant_id = new.restaurant_id and status = 'pending'
        and created_at > now() - interval '10 minutes') >= 100 then
    raise exception 'Restaurante com muitos pedidos pendentes. Tente novamente em instantes.';
  end if;
  return new;
end $$;

drop trigger if exists trg_orders_throttle on public.orders;
create trigger trg_orders_throttle before insert on public.orders
  for each row execute function public.throttle_orders();

revoke execute on function public.throttle_orders() from public, anon, authenticated;
