import { assertWriteAllowed, handleError, json } from "@/lib/http/guard";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    assertWriteAllowed(req);
    const supabase = await supabaseServer();
    await supabase.auth.signOut();
    const res = json({ ok: true });
    // Drops cached private files (photos, PDFs) from this browser.
    res.headers.set("clear-site-data", '"cache"');
    return res;
  } catch (err) {
    return handleError(err, "sign-out");
  }
}
