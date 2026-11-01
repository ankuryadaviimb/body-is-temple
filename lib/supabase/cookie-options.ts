/** Session cookies: HttpOnly so page scripts can never read them, SameSite=Lax against CSRF. */
/** Sessions last 90 days from sign-in (Keychain fills the password in one tap after that). */
export const SESSION_MAX_AGE_S = 90 * 24 * 60 * 60;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: SESSION_MAX_AGE_S,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/**
 * Options for one session cookie write. Our security flags always apply, but a removal
 * (maxAge 0 from the auth library) stays a removal instead of becoming a 90-day cookie.
 */
export function sessionCookieOptions(options?: { maxAge?: number }) {
  return { ...options, ...SESSION_COOKIE_OPTIONS, ...(options?.maxAge === 0 ? { maxAge: 0 } : {}) };
}

/**
 * A session counts as fresh for 90 days from the last sign-in (the "amr" timestamps in the
 * access token). A token without them is treated as stale, so the check fails closed.
 * Used by both the proxy and every server check, so they always agree.
 */
export function sessionIsFresh(claims: { amr?: unknown } | null | undefined, nowMs: number = Date.now()): boolean {
  const amr = claims?.amr;
  if (!Array.isArray(amr)) return false;
  const times = amr.map((a) => (a && typeof a === "object" ? (a as { timestamp?: unknown }).timestamp : null)).filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  if (times.length === 0) return false;
  const age = nowMs / 1000 - Math.max(...times);
  return age <= SESSION_MAX_AGE_S;
}
