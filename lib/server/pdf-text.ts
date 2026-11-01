import { getResolvedPDFJS } from "unpdf";
import { rowsFromItems, type PositionedText } from "@/lib/domain/redact";

/**
 * Reads a PDF into visual rows, page by page. Hard limits keep a huge or hostile file
 * (thousands of pages) from exhausting the server function, and the parser is always
 * freed. Text only: nothing in the PDF is run. The parser runs on the main thread, so the
 * time limits apply between pages; one pathological page is stopped by the platform's 60 s
 * limit, and its record then offers a retry.
 */

export const PDF_LIMITS = { pages: 40, chars: 80_000, totalMs: 12_000, pageMs: 6_000 };

export type PdfRows = { pages: string[][]; totalPages: number; truncated: boolean };

class PdfTimeout extends Error {}

function within<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<T>((_, reject) => (timer = setTimeout(() => reject(new PdfTimeout("pdf_timeout")), ms)))]).finally(() => clearTimeout(timer));
}

export async function pdfRows(bytes: Uint8Array, limits = PDF_LIMITS): Promise<PdfRows> {
  const started = Date.now();
  const { getDocument } = await getResolvedPDFJS();
  // Held here so the parser is freed in every case, a timeout while opening included.
  // A copy of the bytes: the parser may take over (detach) the buffer it is given.
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, disableFontFace: true, stopAtErrors: false });
  try {
    const pdf = await within(task.promise, limits.pageMs);
    const total = pdf.numPages;
    const pages: string[][] = [];
    let chars = 0;
    let truncated = total > limits.pages;
    for (let n = 1; n <= Math.min(total, limits.pages); n++) {
      const left = limits.totalMs - (Date.now() - started);
      if (left <= 0) {
        truncated = true;
        break;
      }
      const page = await within(pdf.getPage(n), Math.min(limits.pageMs, left));
      try {
        const content = await within(page.getTextContent(), Math.min(limits.pageMs, left));
        const items: PositionedText[] = [];
        for (const item of content.items) {
          if (!("str" in item) || typeof item.str !== "string" || !Array.isArray(item.transform)) continue;
          const [a, b, c, d, e, f] = item.transform as number[];
          // Rotated or slanted text (side strips, watermarks) is never a result: skip it, or it
          // would join whatever row it crosses.
          if (Math.abs(b) > Math.abs(a) * 0.05 || Math.abs(c) > Math.abs(d) * 0.05) continue;
          items.push({ str: item.str, x: e, y: f, w: item.width ?? 0, h: item.height || Math.hypot(c, d) || 10 });
        }
        const rows = rowsFromItems(items);
        chars += rows.reduce((sum, r) => sum + r.length, 0);
        pages.push(rows);
      } finally {
        page.cleanup();
      }
      if (chars > limits.chars) {
        truncated = n < total;
        break;
      }
    }
    return { pages, totalPages: total, truncated };
  } finally {
    await task.destroy().catch(() => undefined);
  }
}
