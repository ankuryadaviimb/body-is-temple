import { z } from "zod";
import { isAllowedEmail } from "@/lib/env";
import { assertWriteAllowed, clientIp, handleError, HttpError, json, rateLimit, readJson } from "@/lib/http/guard";
import { supabaseServer } from "@/lib/supabase/server";

const Body = z.strictObject({
  email: z.email().max(254),
  code: z.string().regex(/^\d{6,8}$/),
});

/** Verifies the emailed code. On success the session is set as HttpOnly cookies. */
export async function POST(req: Request) {
  try {
    assertWriteAllowed(req);
    rateLimit(`verify:${clientIp(req)}`, 10, 15 * 60_000);
    const { email, code } = await readJson(req, Body, 2_000);
    if (!isAllowedEmail(email)) throw new HttpError(401, "That code did not work");
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code,
      type: "email",
    });
    if (error) throw new HttpError(401, "That code did not work");
    return json({ ok: true });
  } catch (err) {
    return handleError(err, "verify");
  }
}
