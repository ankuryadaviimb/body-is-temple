import { assertWriteAllowed, handleError, json } from "@/lib/http/guard";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    assertWriteAllowed(req);
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
    return json({ ok: true });
  } catch (err) {
    return handleError(err, "sign-out");
  }
}
