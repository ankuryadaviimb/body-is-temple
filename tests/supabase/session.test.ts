import { describe, expect, it } from "vitest";
import { SESSION_MAX_AGE_S, sessionCookieOptions, sessionIsFresh } from "@/lib/supabase/cookie-options";

describe("session freshness (shared by the proxy and the server)", () => {
  const now = Date.UTC(2026, 10, 1) ;
  const at = (daysAgo: number) => now / 1000 - daysAgo * 86_400;

  it("accepts a session signed in within 90 days", () => {
    expect(sessionIsFresh({ amr: [{ method: "password", timestamp: at(89) }] }, now)).toBe(true);
  });

  it("refuses a session older than 90 days", () => {
    expect(sessionIsFresh({ amr: [{ method: "password", timestamp: at(91) }] }, now)).toBe(false);
    expect(SESSION_MAX_AGE_S).toBe(90 * 86_400);
  });

  it("uses the most recent sign-in when there are several", () => {
    expect(sessionIsFresh({ amr: [{ method: "password", timestamp: at(200) }, { method: "otp", timestamp: at(3) }] }, now)).toBe(true);
  });

  it("fails closed without sign-in times", () => {
    expect(sessionIsFresh({}, now)).toBe(false);
    expect(sessionIsFresh({ amr: [] }, now)).toBe(false);
    expect(sessionIsFresh({ amr: [{ method: "password" }] }, now)).toBe(false);
    expect(sessionIsFresh(null, now)).toBe(false);
  });

  it("keeps a cookie removal a removal, and our flags on every write", () => {
    expect(sessionCookieOptions({ maxAge: 0 }).maxAge).toBe(0);
    expect(sessionCookieOptions({ maxAge: 400 }).maxAge).toBe(SESSION_MAX_AGE_S);
    expect(sessionCookieOptions(undefined)).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });
});
