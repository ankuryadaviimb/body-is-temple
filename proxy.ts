import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env, isAllowedEmail } from "@/lib/env";
import { buildCsp, newNonce } from "@/lib/http/csp";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";

/**
 * Runs before every page request:
 * 1. Sets a strict CSP with a fresh nonce (Next.js applies it to its own scripts).
 * 2. Refreshes the Supabase session cookie when needed.
 * 3. Sends signed-out visitors to /login. API routes check auth themselves.
 */

const PUBLIC_PATHS = new Set(["/login"]);

export async function proxy(request: NextRequest) {
  const nonce = newNonce();
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const withSecurityHeaders = (res: NextResponse) => {
    res.headers.set("content-security-policy", csp);
    return res;
  };

  let config: ReturnType<typeof env>;
  try {
    config = env();
  } catch {
    return withSecurityHeaders(new NextResponse("This app is not configured yet.", { status: 503 }));
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  const supabase = createServerClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        requestHeaders.set("cookie", request.cookies.toString());
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS });
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const signedIn = Boolean(claims?.sub) && isAllowedEmail(typeof claims?.email === "string" ? claims.email : null);
  const path = request.nextUrl.pathname;

  if (!signedIn && !PUBLIC_PATHS.has(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return withSecurityHeaders(NextResponse.redirect(url));
  }
  if (signedIn && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return withSecurityHeaders(NextResponse.redirect(url));
  }

  return withSecurityHeaders(response);
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icons|icon|apple-icon|manifest.webmanifest|sw.js|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
