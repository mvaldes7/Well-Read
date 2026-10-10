import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

/** Client Component client (singleton inside @supabase/ssr). Returns null when env is missing. */
export function createClient() {
  const env = getSupabaseEnv();
  if (!env) return null;
  return createBrowserClient(env.url, env.publishableKey);
}
