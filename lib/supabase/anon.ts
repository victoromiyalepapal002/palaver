import { createClient } from "@supabase/supabase-js";

/** Plain anon client with no cookies. For places like image routes that have no user session. */
export function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}
