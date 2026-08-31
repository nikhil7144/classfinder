import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// createBrowserClient (not supabase-js's plain createClient) stores the
// session in cookies, not just localStorage — required so that server
// components and proxy.ts (both cookie-based via @supabase/ssr) can see
// the session a client-side OTP/OAuth login just created.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);