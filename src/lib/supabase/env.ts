// Reads the client-safe Supabase settings. Returns null instead of throwing so a
// build or request without env (e.g. CI) doesn't crash; callers treat null as
// "auth not configured". Keep the literal `process.env.NEXT_PUBLIC_*` reads so
// Next.js can inline them.
export interface SupabaseEnv {
  url: string;
  publishableKey: string;
}

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}
