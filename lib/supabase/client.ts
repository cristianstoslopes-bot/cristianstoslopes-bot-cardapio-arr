import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

let browserClient: SupabaseClient | undefined;

/**
 * Cliente para Client Components. Singleton: reaproveita a conexão Realtime.
 * Usa a chave pública → todas as queries passam pelo RLS do Postgres.
 */
export function createClient(): SupabaseClient {
  browserClient ??= createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return browserClient;
}
