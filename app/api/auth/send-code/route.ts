import { z } from "zod";
import { isAllowedEmail } from "@/lib/env";
import { assertWriteAllowed, clientIp, handleError, json, rateLimit, readJson } from "@/lib/http/guard";
import { supabaseServer } from "@/lib/supabase/server";

const Body = z.strictObject({ email: z.email().max(254) });

/**
 * Sends a 6-digit sign-in code by email. Only emails in ALLOWED_EMAILS can sign in.
 * The response is the same either way, so the endpoint does not reveal who is allowed.
 */
export async function POST(req: Request) {
  try {
    assertWriteAllowed(req);
    rateLimit(`send-code:${clientIp(req)}`, 5, 15 * 60_000);
    const { email } = await readJson(req, Body, 2_000);
    if (isAllowedEmail(email)) {
      const supabase = await supabaseServer();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: true },
      });
      if (error) console.error(JSON.stringify({ level: "warn", route: "send-code", error: error.name }));
    }
    return json({ ok: true });
  } catch (err) {
    return handleError(err, "send-code");
  }
}
