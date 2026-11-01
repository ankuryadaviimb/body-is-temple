"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { MAX_DOCUMENT_BYTES, type DocKind, type HealthDocument } from "@/lib/domain/records";
import { ApiError, apiGet, apiSend, apiUpload } from "./api";
import { kvGet, kvSet } from "./db";
import { prepareDocumentPhoto } from "./photo";

/** Health records on the phone: a cached list for offline viewing; uploads need a connection. */

const KEY = "documents";

export function useDocuments(): HealthDocument[] | null | undefined {
  return useLiveQuery(async () => (await kvGet<HealthDocument[]>(KEY)) ?? null, []);
}

export async function refreshDocuments(): Promise<HealthDocument[] | null> {
  try {
    const { documents } = await apiGet<{ documents: HealthDocument[] }>("/api/documents");
    await kvSet(KEY, documents);
    return documents;
  } catch {
    return null;
  }
}

async function upsertLocal(doc: HealthDocument) {
  const list = (await kvGet<HealthDocument[]>(KEY)) ?? [];
  await kvSet(KEY, [doc, ...list.filter((d) => d.id !== doc.id)]);
}

export class UploadError extends Error {}

/** A PDF is recognised by its first bytes, not its name: anything else is treated as a photo. */
export async function isPdfFile(file: Blob): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === "%PDF-";
}

/**
 * Uploads one record. A photo is re-encoded on the phone first (no location or device
 * details); PDFs go as they are. Over 4 MB is refused before sending. `id` is chosen once
 * per picked file by the caller, so a retry after a lost reply finds the record already
 * saved instead of storing it twice.
 */
export async function uploadDocument(
  file: File,
  meta: { kind: DocKind; title?: string; doc_date?: string | null; notes?: string | null; read: boolean },
  id: string,
): Promise<HealthDocument> {
  const isPdf = await isPdfFile(file);
  let body: Blob;
  try {
    body = isPdf ? file : await prepareDocumentPhoto(file);
  } catch {
    throw new UploadError("That file could not be read. Use a PDF or a photo.");
  }
  if (body.size > MAX_DOCUMENT_BYTES) {
    throw new UploadError(isPdf ? "This PDF is over 4 MB. Try a smaller copy, or add photos of the pages instead." : "This photo is too large even after shrinking.");
  }
  const form = new FormData();
  form.set("file", body, isPdf ? "report.pdf" : "report.jpg");
  form.set("meta", JSON.stringify({ id, ...meta }));
  try {
    const { document } = await apiUpload<{ document: HealthDocument }>("/api/documents", form);
    await upsertLocal(document);
    return document;
  } catch (err) {
    if (err instanceof ApiError && err.status === 415) throw new UploadError("That file type is not supported. Use a PDF or a photo.");
    if (err instanceof ApiError && err.status === 413) throw new UploadError("That file is over 4 MB.");
    throw new UploadError("Could not upload. Check your connection and try again.");
  }
}

export async function editDocument(id: string, patch: { kind?: DocKind; title?: string; doc_date?: string | null; notes?: string | null }): Promise<void> {
  const { document } = await apiSend<{ document: HealthDocument }>("PATCH", `/api/documents/${id}`, patch);
  await upsertLocal(document);
}

export async function removeDocument(id: string): Promise<void> {
  await apiSend("DELETE", `/api/documents/${id}`);
  const list = (await kvGet<HealthDocument[]>(KEY)) ?? [];
  await kvSet(KEY, list.filter((d) => d.id !== id));
}

/** Reads a record again. `allow: true` is the person's OK to send free text or a photo to the AI. */
export async function readDocument(id: string, allow = false): Promise<void> {
  const { document } = await apiSend<{ document: HealthDocument }>("POST", `/api/documents/${id}/extract`, { allow });
  await upsertLocal(document);
  watchPendingReads();
}

let watching: ReturnType<typeof setTimeout> | null = null;

/** Checks back while any record is still being read (a read can take up to a minute). */
export function watchPendingReads(until = Date.now() + 3 * 60_000) {
  if (watching) clearTimeout(watching);
  watching = setTimeout(async () => {
    watching = null;
    const list = await refreshDocuments();
    if (list?.some((d) => d.status === "pending") && Date.now() < until) watchPendingReads(until);
  }, 6_000);
}

/**
 * Hands the file to the phone (share sheet: Files, Mail, Print), fetched from inside the
 * app so it always carries the session. A fallback for "Open" on a Home Screen app.
 */
export async function shareDocumentFile(doc: HealthDocument): Promise<"shared" | "saved"> {
  const res = await fetch(`/api/media/${doc.id}`, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) throw new ApiError(res.status, "Could not get the file");
  const blob = await res.blob();
  const ext = doc.mime === "application/pdf" ? "pdf" : doc.mime === "image/png" ? "png" : doc.mime === "image/webp" ? "webp" : "jpg";
  const name = `${doc.title.replace(/[^\w\s.-]/g, "").trim().slice(0, 60) || "record"}.${ext}`;
  const file = new File([blob], name, { type: blob.type || doc.mime || "application/octet-stream" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: doc.title });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "shared";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}
