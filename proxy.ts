import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Refreshes the auth cookie. This is a network round-trip to the Supabase
  // auth server, so the matcher below must stay narrow — running it per asset
  // request made page loads take minutes in development.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Page navigations only. Everything below is excluded because it does not
     * need a refreshed session cookie, and each match costs a round-trip:
     *   _next/*      build output, HMR and prefetch traffic
     *   api/*        route handlers, which authenticate from the Bearer token
     *   static files and the SEO endpoints
     */
    "/((?!_next/|api/|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)",
  ],
};
