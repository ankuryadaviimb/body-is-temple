import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env, isAllowedEmail } from "@/lib/env";
import { SESSION_COOKIE_OPTIONS } from "./cookie-options";

/**
 * Supabase is only ever called from the server. The browser never sees a Supabase
 * key or token: the session lives in HttpOnly cookies, and every query runs as the
 * signed-in user, so row-level security applies to all of them.
 */

export async function supabaseServer(): Promise<SupabaseClient> {
  const store = await cookies();
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = env();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) {
            store.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS });
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy
          // refreshes the session on navigation, so this is safe to ignore.
        }
      },
    },
  });
}

export type AuthedContext = { supabase: SupabaseClient; userId: string };

export class AuthError extends Error {
  constructor() {
    super("Not signed in");
  }
}

/** Verifies the session (JWT checked by Supabase) and the allowed-email list. */
export async function requireUser(): Promise<AuthedContext> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) throw new AuthError();
  const email = typeof claims.email === "string" ? claims.email : null;
  if (!isAllowedEmail(email)) throw new AuthError();
  return { supabase, userId: claims.sub };
}
