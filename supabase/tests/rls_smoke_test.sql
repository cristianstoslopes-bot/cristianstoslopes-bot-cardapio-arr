\set ON_ERROR_STOP 0
insert into auth.users(id,email) values ('11111111-1111-1111-1111-111111111111','a@a'),('22222222-2222-2222-2222-222222222222','b@b');
-- user A cria restaurante
set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select slug from create_restaurant('Burger A','burger-a');
insert into categories(restaurant_id,name) select id,'Burgers' from restaurants where slug='burger-a';
insert into products(restaurant_id,category_id,name,price_cents,addon_groups)
  select r.id,c.id,'X-Bacon',3000,'[{"id":"g1","name":"Extras","min":0,"max":2,"options":[{"id":"o1","name":"Cheddar","price_cents":500},{"id":"o2","name":"Ovo","price_cents":300}]}]'
  from restaurants r join categories c on c.restaurant_id=r.id where r.slug='burger-a';
insert into coupons(restaurant_id,code,discount_type,discount_value) select id,'DEZ','percent',10 from restaurants where slug='burger-a';
-- user B cria outro restaurante
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select slug from create_restaurant('Pizza B','pizza-b');
\echo '--- B tenta ler coupons de A (esperado 0)'
select count(*) from coupons;
\echo '--- B tenta alterar produto de A (esperado UPDATE 0)'
update products set price_cents=1 where name='X-Bacon';
\echo '--- B tenta inserir categoria em A (esperado erro RLS)'
insert into categories(restaurant_id,name) select id,'hack' from restaurants where slug='burger-a';
\echo '--- B tenta virar membro de A (esperado erro RLS)'
insert into users(restaurant_id,user_id,role) select id,'22222222-2222-2222-2222-222222222222','owner' from restaurants where slug='burger-a';
-- anon faz pedido
reset role; set role anon; select set_config('request.jwt.claim.sub','',false);
\echo '--- anon le cardapio publico (esperado 1)'
select count(*) from products;
\echo '--- anon le orders (esperado 0) e customers (permission denied ou 0)'
select count(*) from orders;
\echo '--- anon place_order com preco forjado ignorado: 2x(3000+500+300)=7600 -10% = 6840'
select place_order((select id from restaurants where slug='burger-a'), jsonb_build_object(
  'type','pickup','payment_method','cash','coupon_code','dez','customer',jsonb_build_object('name','Joao','phone','(11) 99999-0000'),
  'items',jsonb_build_array(jsonb_build_object('product_id',(select id from products limit 1),'quantity',2,'price_cents',1,
     'addons',jsonb_build_array(jsonb_build_object('group_id','g1','option_ids',jsonb_build_array('o1','o2')))))));
\echo '--- anon place_order com adicional inexistente (esperado erro)'
select place_order((select id from restaurants where slug='burger-a'), jsonb_build_object(
  'type','pickup','payment_method','cash','customer',jsonb_build_object('name','Joao','phone','11999990000'),
  'items',jsonb_build_array(jsonb_build_object('product_id',(select id from products limit 1),'quantity',1,
     'addons',jsonb_build_array(jsonb_build_object('group_id','g1','option_ids',jsonb_build_array('zzz')))))));
\echo '--- anon place_order online sem plano? (trial pro permite) / anon insere analytics order_placed (esperado erro)'
insert into analytics_events(restaurant_id,event_type) select id,'order_placed' from restaurants where slug='burger-a';
insert into analytics_events(restaurant_id,event_type,session_id) select id,'model_view_3d','s1' from restaurants where slug='burger-a';
-- A gerencia pedido
reset role; set role authenticated; select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
\echo '--- A ve pedido'
select number,status,subtotal_cents,discount_cents,total_cents from orders;
\echo '--- A tenta alterar total (esperado permission denied)'
update orders set total_cents=1;
\echo '--- A pula status pending->ready (esperado erro de transicao)'
update orders set status='ready';
update orders set status='accepted' returning status, accepted_at is not null as ts;
\echo '--- B nao ve pedido de A (esperado 0)'
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select count(*) from orders; select count(*) from customers;
\echo '--- B: dashboard_metrics de A (esperado acesso negado)'
select dashboard_metrics((select id from restaurants where slug='burger-a'), now()-interval '1 day', now()+interval '1 day');
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select dashboard_metrics((select id from restaurants where slug='burger-a'), now()-interval '1 day', now()+interval '1 day') -> 'revenue_cents' as rev;
\echo '--- storage: A sobe em pasta propria (ok) e na de B (erro)'
insert into storage.objects(bucket_id,name) select 'restaurant-assets', id||'/logo.png' from restaurants where slug='burger-a';
insert into storage.objects(bucket_id,name) select 'restaurant-assets', id||'/logo.png' from restaurants where slug='pizza-b';
\echo '--- plano: rebaixa A para starter, tenta criar modelo 3D (esperado PLAN_FEATURE_REQUIRED)'
reset role; update subscriptions set plan_id='starter', status='active' where restaurant_id=(select id from restaurants where slug='burger-a');
set role authenticated;
insert into models_3d(restaurant_id,name,glb_path) select id,'x','a/b.glb' from restaurants where slug='burger-a';
insert into storage.objects(bucket_id,name) select 'models-3d', id||'/m.glb' from restaurants where slug='burger-a';
\echo '--- get_order_by_token como anon'
reset role; select (select public_token from orders limit 1) as tok \gset
set role anon; select get_order_by_token(:'tok'::uuid) ->> 'status' as status_anon;
