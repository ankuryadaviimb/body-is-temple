import { z } from "zod";
import { isAllowedEmail } from "@/lib/env";
import { assertWriteAllowed, clientIp, handleError, HttpError, json, rateLimit, readJson, steadyTiming } from "@/lib/http/guard";
import { supabaseServer } from "@/lib/supabase/server";

const Body = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

const FAILED = "Email or password is not right, or the email is not confirmed yet";

/** Email and password sign-in. On success the session is set as HttpOnly cookies. */
export async function POST(req: Request) {
  const started = Date.now();
  let res: Response;
  try {
    assertWriteAllowed(req);
    rateLimit(`sign-in:${clientIp(req)}`, 10, 15 * 60_000);
    const { email, password } = await readJson(req, Body, 2_000);
    if (!isAllowedEmail(email)) throw new HttpError(401, FAILED);
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) throw new HttpError(401, FAILED);
    res = json({ ok: true });
  } catch (err) {
    res = handleError(err, "sign-in");
  }
  await steadyTiming(started);
  return res;
}
