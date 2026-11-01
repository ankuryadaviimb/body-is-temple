import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env, isAllowedEmail } from "@/lib/env";
import { buildCsp, newNonce } from "@/lib/http/csp";
import { SESSION_COOKIE_OPTIONS, sessionCookieOptions, sessionIsFresh } from "@/lib/supabase/cookie-options";

/**
 * Runs before every page request:
 * 1. Sets a strict CSP with a fresh nonce (Next.js applies it to its own scripts).
 * 2. Refreshes the Supabase session cookie when needed.
 * 3. Sends signed-out visitors to /login. API routes check auth themselves.
 */

const PUBLIC_PATHS = new Set(["/login", ...(process.env.NODE_ENV === "development" ? ["/dev/preview"] : [])]);

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
          response.cookies.set(name, value, sessionCookieOptions(options));
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  const hasSession = Boolean(claims?.sub);
  // The same rules as every server check (allowed email, 90-day cap), so the proxy never
  // sends someone back into the app that the app itself would refuse.
  const signedIn = hasSession && isAllowedEmail(typeof claims?.email === "string" ? claims.email : null) && sessionIsFresh(claims);
  const path = request.nextUrl.pathname;

  if (hasSession && !signedIn) {
    // An expired or refused session: end it and clear its cookies, so /login can load.
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    for (const c of request.cookies.getAll()) {
      if (c.name.startsWith("sb-")) response.cookies.set(c.name, "", { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
    }
  }

  if (!signedIn && !PUBLIC_PATHS.has(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return withSecurityHeaders(redirect);
  }
  if (signedIn && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    // Carry any refreshed session cookies, or the next request would refresh again.
    const redirect = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return withSecurityHeaders(redirect);
  }

  return withSecurityHeaders(response);
}

export const config = {
  // Prefetches go through here too: the tabs are prefetched, and a prefetch that arrives with
  // an expired session must refresh it and save the new cookies, like any page request.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icons|icon|apple-icon|splash|manifest.webmanifest|sw.js|robots.txt).*)"],
};
