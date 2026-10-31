import "server-only";
import { detectType, type DetectedType } from "@/lib/domain/file-type";
import { HttpError } from "@/lib/http/guard";
import type { AuthedContext } from "@/lib/supabase/server";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const BUCKET = "media";

type Detected = DetectedType;

export type MediaKind = "meal_photo" | "stool_photo" | "report";

/** Validates and stores a file under "<user id>/<media id>.<ext>". Returns the stored type. */
export async function storeMedia(
  ctx: AuthedContext,
  mediaId: string,
  kind: MediaKind,
  file: File,
): Promise<{ mime: Detected["mime"]; bytes: number }> {
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "File too large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectType(bytes);
  const allowed = kind === "report" ? ["image/jpeg", "image/png", "image/webp", "application/pdf"] : ["image/jpeg", "image/png", "image/webp"];
  if (!type || !allowed.includes(type.mime)) throw new HttpError(415, "Unsupported file type");

  const path = `${ctx.userId}/${mediaId}.${type.ext}`;
  const { error: upErr } = await ctx.supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: type.mime, upsert: false });
  // An identical retry after a dropped connection finds the object already there.
  if (upErr && !/exists|duplicate/i.test(upErr.message)) throw new Error("media_upload_failed");

  const { error } = await ctx.supabase
    .from("media")
    .upsert(
      { id: mediaId, user_id: ctx.userId, kind, path, mime: type.mime, bytes: bytes.length },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (error) throw new Error("media_row_failed");
  return { mime: type.mime, bytes: bytes.length };
}

export async function readMedia(ctx: AuthedContext, mediaId: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  const { data: row, error } = await ctx.supabase
    .from("media")
    .select("path, mime")
    .eq("user_id", ctx.userId)
    .eq("id", mediaId)
    .maybeSingle();
  if (error) throw new Error("media_read_failed");
  if (!row) return null;
  const { data: blob, error: dlErr } = await ctx.supabase.storage.from(BUCKET).download(row.path as string);
  if (dlErr || !blob) throw new Error("media_download_failed");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: row.mime as string };
}
