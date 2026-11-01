import { z } from "zod";
import { handleError, HttpError } from "@/lib/http/guard";
import { readMedia } from "@/lib/server/media";
import { requireUser } from "@/lib/supabase/server";

/**
 * Streams a private photo or document to its owner only. Storage URLs are never exposed to the
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
        // PDFs open in the phone's own viewer; the file is the owner's own upload.
        "content-disposition": "inline",
        // An uploaded file is never a page of this app: no scripts, no access to the app's
        // origin, and other sites cannot embed it. Browsers' own PDF viewers still work
        // (Safari needs object-src for PDFs).
        "content-security-policy": media.mime === "application/pdf" ? "default-src 'none'; object-src 'self'; sandbox" : "default-src 'none'; sandbox",
        "cross-origin-resource-policy": "same-origin",
      },
    });
  } catch (err) {
    return handleError(err, "media.get");
  }
}
