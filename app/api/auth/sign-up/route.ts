import { z } from "zod";
import { env, isAllowedEmail } from "@/lib/env";
import { assertWriteAllowed, clientIp, handleError, json, rateLimit, readJson } from "@/lib/http/guard";
import { supabaseServer } from "@/lib/supabase/server";

const Body = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(12).max(128),
});

/**
 * One-time account creation for an email in ALLOWED_EMAILS. Supabase then emails a
 * confirmation link. The reply is the same for any email, so it does not reveal who is allowed.
 */
export async function POST(req: Request) {
  try {
    assertWriteAllowed(req);
    rateLimit(`sign-up:${clientIp(req)}`, 3, 60 * 60_000);
    const { email, password } = await readJson(req, Body, 2_000);
    if (isAllowedEmail(email)) {
      const supabase = await supabaseServer();
      const origin = env().APP_ORIGIN ?? new URL(req.url).origin;
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { emailRedirectTo: `${origin}/login` },
      });
      if (error) console.error(JSON.stringify({ level: "warn", route: "sign-up", error: error.name }));
    }
    return json({ ok: true });
  } catch (err) {
    return handleError(err, "sign-up");
  }
}
