"use client";

import { ApiError } from "./api";

/**
 * Downloads the full export. On iPhone it opens the share sheet (Save to Files, AirDrop,
 * Mail); elsewhere it saves the file directly.
 */
export async function downloadExport(): Promise<"shared" | "saved"> {
  const res = await fetch("/api/export", { headers: { "x-temple-client": "1" }, credentials: "same-origin", cache: "no-store" });
  if (!res.ok) throw new ApiError(res.status, "Export failed");
  const blob = await res.blob();
  // The file is streamed: if the server stopped part way, it does not parse. Never save half a backup.
  try {
    const parsed = JSON.parse(await blob.text()) as { app?: string };
    if (parsed.app !== "Temple") throw new Error("not an export");
  } catch {
    throw new ApiError(502, "Export incomplete");
  }
  const name = `temple-export-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], name, { type: "application/json" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Temple export" });
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
