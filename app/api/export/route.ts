import { assertReadAllowed, handleError, rateLimit } from "@/lib/http/guard";
import { exportStream } from "@/lib/server/export";
import { requireUser } from "@/lib/supabase/server";

export const maxDuration = 60;

/** GET /api/export: everything as one JSON file, streamed. Needs the app's own header (no plain links). */
export async function GET(req: Request) {
  try {
    assertReadAllowed(req);
    const ctx = await requireUser();
    rateLimit(`export:${ctx.userId}`, 10, 60 * 60_000);
    const day = new Date().toISOString().slice(0, 10);
    return new Response(exportStream(ctx), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="temple-export-${day}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err, "export");
  }
}
