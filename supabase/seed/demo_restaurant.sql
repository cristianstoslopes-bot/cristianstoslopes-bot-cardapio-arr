-- =============================================================================
-- Restaurante de DEMONSTRAÇÃO com pratos 3D realistas (escaneados).
-- Cardápio público: /r/demo  ·  Mesa de exemplo: /r/demo/table/<id da mesa 1>
--
-- Modelos 3D e fotos: Poly Haven (polyhaven.com), licença CC0 (domínio público).
-- Arquivos servidos pelo próprio site em /public/demo.
-- Rodar no SQL Editor do Supabase (pode rodar de novo: recria a demo do zero).
-- =============================================================================
do $$
declare
  r uuid;
  c_conf uuid;
  c_frutas uuid;
  m_croissant uuid; m_cenoura uuid; m_morango uuid; m_roma uuid;
begin
  delete from public.restaurants where slug = 'demo';

  insert into public.restaurants (slug, name, description, accepts_delivery, accepts_pickup, accepts_dine_in,
                                  delivery_fee_cents, theme)
  values ('demo', 'Café Demonstração AR',
          'Cardápio de exemplo: toque em "Ver em 3D / AR" e coloque o prato em cima da sua mesa pela câmera do celular.',
          true, true, true, 700,
          jsonb_build_object('primary','#243B32','secondary','#F4EBDD','accent','#D88B48','background','#FFFDF9','foreground','#1C1C1A'))
  returning id into r;

  -- Plano Premium ativo (libera modelos 3D/AR e pagamento online na demo)
  insert into public.subscriptions (restaurant_id, plan_id, status, current_period_end)
  values (r, 'premium', 'active', now() + interval '10 years');

  insert into public.categories (restaurant_id, name, position) values (r, 'Confeitaria', 1) returning id into c_conf;
  insert into public.categories (restaurant_id, name, position) values (r, 'Frutas frescas', 2) returning id into c_frutas;

  -- real_size_m = maior dimensão real (Poly Haven); dimensions em metros (unidade do arquivo)
  insert into public.models_3d (restaurant_id, name, glb_path, real_size_m, dimensions, file_size_bytes)
  values (r, 'Croissant', '/demo/models/croissant.glb', 0.200, '{"x":0.200,"y":0.076,"z":0.062}', 646000)
  returning id into m_croissant;
  insert into public.models_3d (restaurant_id, name, glb_path, real_size_m, dimensions, file_size_bytes)
  values (r, 'Bolo de cenoura', '/demo/models/carrot_cake.glb', 0.225, '{"x":0.225,"y":0.225,"z":0.098}', 1330000)
  returning id into m_cenoura;
  insert into public.models_3d (restaurant_id, name, glb_path, real_size_m, dimensions, file_size_bytes)
  values (r, 'Torta de morango com chocolate', '/demo/models/strawberry_chocolate_cake.glb', 0.244, '{"x":0.244,"y":0.240,"z":0.079}', 1540000)
  returning id into m_morango;
  insert into public.models_3d (restaurant_id, name, glb_path, real_size_m, dimensions, file_size_bytes)
  values (r, 'Romã', '/demo/models/food_pomegranate_01.glb', 0.115, '{"x":0.114,"y":0.115,"z":0.115}', 590000)
  returning id into m_roma;

  insert into public.products (restaurant_id, category_id, name, description, price_cents, allergens, tags,
                               model_3d_id, image_url, is_featured, position, prep_time_minutes, addon_groups)
  values
  (r, c_conf, 'Croissant de manteiga', 'Massa folhada artesanal, crocante por fora e macia por dentro.', 1290,
   '{glúten,lactose,ovo}', '{artesanal}', m_croissant, '/demo/img/croissant.jpg', true, 1, 5,
   '[{"id":"rech","name":"Recheio","min":0,"max":1,"options":[{"id":"pq","name":"Presunto e queijo","price_cents":600},{"id":"ch","name":"Chocolate","price_cents":400}]}]'),
  (r, c_conf, 'Bolo de cenoura (inteiro)', 'Bolo de cenoura fofinho com cobertura. Serve 8 fatias.', 5900,
   '{glúten,lactose,ovo}', '{}', m_cenoura, '/demo/img/carrot_cake.jpg', true, 2, 10, '[]'),
  (r, c_conf, 'Torta de morango com chocolate', 'Creme de chocolate, morangos frescos e farofa crocante.', 8900,
   '{glúten,lactose,ovo}', '{especial}', m_morango, '/demo/img/strawberry_chocolate_cake.jpg', true, 3, 10, '[]'),
  (r, c_frutas, 'Romã', 'Fruta fresca selecionada.', 990,
   '{}', '{vegano}', m_roma, '/demo/img/food_pomegranate_01.jpg', false, 1, 2, '[]');

  insert into public.tables (restaurant_id, label) values (r, '1'), (r, '2'), (r, '3');
end $$;

-- Mostra os links prontos
select 'https://cardapio-ar-one.vercel.app/r/demo' as cardapio,
       'https://cardapio-ar-one.vercel.app/r/demo/table/' || t.id as mesa_1
from public.tables t join public.restaurants r on r.id = t.restaurant_id
where r.slug = 'demo' and t.label = '1';
