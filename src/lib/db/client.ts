import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readEnv, requireEnv } from "../env";

let client: SupabaseClient | null = null;

/**
 * Cliente Supabase com a chave service_role.
 * Uso exclusivo em código de servidor (Server Components, Server Actions, scripts).
 */
export function getServiceClient(): SupabaseClient {
  if (client) return client;
  const env = requireEnv(readEnv(), ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function isSupabaseConfigured(): boolean {
  const env = readEnv();
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}
