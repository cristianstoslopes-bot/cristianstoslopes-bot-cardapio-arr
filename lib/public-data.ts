import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import type { Category, Product, Restaurant } from "@/lib/types";

/**
 * Leituras públicas do cardápio com cliente ANÔNIMO (sem cookies) → cacheáveis.
 * O RLS continua valendo: o papel `anon` só enxerga restaurante ativo e itens disponíveis.
 * Cache curto (30s) para que mudanças do painel (esgotado, loja fechada) apareçam rápido,
 * mas absorvendo picos de acesso (ex.: 40 mesas escaneando o QR ao mesmo tempo).
 */
function anonClient() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
}

const PUBLIC_CACHE = { stale: 30, revalidate: 30, expire: 300 } as const;

export async function getRestaurantBySlug(slug: string) {
  "use cache";
  cacheLife(PUBLIC_CACHE);
  cacheTag(`restaurant:${slug}`);
  const { data } = await anonClient().from("restaurants").select("*").eq("slug", slug).eq("is_active", true).maybeSingle();
  return (data as Restaurant) ?? null;
}

export async function getPublicMenu(restaurantId: string) {
  "use cache";
  cacheLife(PUBLIC_CACHE);
  cacheTag(`menu:${restaurantId}`);
  const supabase = anonClient();
  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from("categories").select("*").eq("restaurant_id", restaurantId).eq("is_active", true).order("position"),
    supabase
      .from("products")
      .select("*, model_3d:models_3d(*)")
      .eq("restaurant_id", restaurantId)
      .eq("is_available", true)
      .order("position"),
  ]);
  return { categories: (categories ?? []) as Category[], products: (products ?? []) as Product[] };
}

/** Mesa do QR — precisa pertencer a ESTE restaurante (impede QR de um tenant apontar para outro). */
export async function getPublicTable(restaurantId: string, tableId: string) {
  "use cache";
  cacheLife(PUBLIC_CACHE);
  const { data } = await anonClient()
    .from("tables")
    .select("id, label")
    .eq("id", tableId)
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .maybeSingle();
  return (data as { id: string; label: string }) ?? null;
}
