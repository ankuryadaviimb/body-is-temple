"use client";

import exifr from "exifr";

/**
 * Prepares a photo on the phone before upload:
 * - reads the original "date taken" (so photos logged later keep their real time),
 * - shrinks it to at most 1280 px and re-encodes it as JPEG.
 * Re-encoding drops all metadata, including location and device details, so none of
 * that ever leaves the phone.
 */

const MAX_EDGE = 1280;
const MAX_AGE_MS = 7 * 86_400_000;

export async function readTakenAt(file: File): Promise<Date | null> {
  try {
    const tags = (await exifr.parse(file, ["DateTimeOriginal", "CreateDate"])) as
      | { DateTimeOriginal?: Date; CreateDate?: Date }
      | undefined;
    const d = tags?.DateTimeOriginal ?? tags?.CreateDate;
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
    const age = Date.now() - d.getTime();
    return age >= -5 * 60_000 && age <= MAX_AGE_MS ? d : null;
  } catch {
    return null;
  }
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function shrinkPhoto(file: File, maxEdge = MAX_EDGE, quality = 0.82): Promise<Blob> {
  const source = await decode(file);
  const w = "width" in source ? source.width : 0;
  const h = "height" in source ? source.height : 0;
  if (!w || !h) throw new Error("Could not read photo");
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available");
  ctx.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  if ("close" in source && typeof source.close === "function") source.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Could not encode photo");
  return blob;
}

export async function prepareMealPhoto(file: File, fromCamera: boolean): Promise<{ blob: Blob; takenAt: Date | null }> {
  const [blob, takenAt] = await Promise.all([shrinkPhoto(file), fromCamera ? Promise.resolve(null) : readTakenAt(file)]);
  return { blob, takenAt };
}

/** Photos of reports keep more detail (small print), but are re-encoded the same way. */
export async function prepareDocumentPhoto(file: File): Promise<Blob> {
  return shrinkPhoto(file, 2400, 0.9);
}
