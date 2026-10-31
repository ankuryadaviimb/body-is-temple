import { z } from "zod";
import { handleError, HttpError } from "@/lib/http/guard";
import { readMedia } from "@/lib/server/media";
import { requireUser } from "@/lib/supabase/server";

/**
 * Streams a private photo to its owner only. Storage URLs are never exposed to the
 * browser, so the CSP can stay same-origin and links cannot be shared by accident.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireUser();
    const id = z.uuid().safeParse((await params).id);
    if (!id.success) throw new HttpError(404, "Not found");
    const media = await readMedia(ctx, id.data);
    if (!media) throw new HttpError(404, "Not found");
    return new Response(media.bytes as BodyInit, {
      headers: {
        "content-type": media.mime,
        "cache-control": "private, max-age=86400",
        "x-content-type-options": "nosniff",
        "content-disposition": media.mime === "application/pdf" ? "attachment" : "inline",
      },
    });
  } catch (err) {
    return handleError(err, "media.get");
  }
}
