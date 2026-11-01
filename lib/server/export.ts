import "server-only";
import type { AuthedContext } from "@/lib/supabase/server";

/**
 * A full copy of the person's own data, as JSON, for safekeeping (the free database
 * plan keeps no backups). Photos stay in private storage; the export lists them.
 *
 * Streamed page by page, so its size has no limit (a single reply is capped at about
 * 4.5 MB on the host), and every page is ordered on a unique key, so paging never skips
 * or repeats a row.
 */

const PAGE = 1000;
const MAX_PAGES = 200;
const NOTE = "Your own data from Temple. Photos are listed under media and stay in your private storage.";

type Source = { key: string; table: string; columns: string; order: string[]; liveOnly?: boolean };

const SOURCES: Source[] = [
  { key: "events", table: "events", columns: "id, kind, occurred_at, logical_day, source, payload, meta, created_at, updated_at", order: ["occurred_at", "id"], liveOnly: true },
  { key: "memory", table: "memory_files", columns: "slug, content, version, updated_at", order: ["slug"] },
  { key: "memory_versions", table: "memory_versions", columns: "slug, version, content, source, created_at", order: ["created_at", "slug", "version"] },
  { key: "coach_messages", table: "coach_messages", columns: "id, created_at, logical_day, intent, question, quick, answer, status, provider", order: ["created_at", "id"] },
  { key: "coach_cards", table: "coach_cards", columns: "logical_day, kind, status, content, provider, created_at", order: ["logical_day", "kind"] },
  { key: "media", table: "media", columns: "id, kind, mime, bytes, created_at", order: ["created_at", "id"] },
  { key: "health_documents", table: "health_documents", columns: "id, kind, title, doc_date, notes, status, extraction, pages, created_at, updated_at", order: ["created_at", "id"] },
];

async function readPage(ctx: AuthedContext, s: Pick<Source, "table" | "columns" | "order" | "liveOnly">, page: number): Promise<unknown[]> {
  let q = ctx.supabase.from(s.table).select(s.columns).eq("user_id", ctx.userId);
  if (s.liveOnly) q = q.is("deleted_at", null);
  for (const col of s.order) q = q.order(col);
  const { data, error } = await q.range(page * PAGE, page * PAGE + PAGE - 1);
  if (error) throw new Error(`export_read_failed:${s.table}`);
  return data ?? [];
}

/**
 * The export as a stream of JSON text. If reading fails part way, the stream errors and the
 * file stays incomplete: the app checks that the whole file parses before saving it.
 */
export function exportStream(ctx: AuthedContext): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (s: string) => controller.enqueue(enc.encode(s));
      try {
        write(`{"app":"Temple","format":1,"exported_at":${JSON.stringify(new Date().toISOString())},"note":${JSON.stringify(NOTE)}`);
        const [settings] = (await readPage(ctx, { table: "settings", columns: "data, updated_at", order: ["updated_at"] }, 0)) as { data?: unknown }[];
        write(`,"settings":${JSON.stringify(settings?.data ?? null)}`);
        for (const source of SOURCES) {
          write(`,\n${JSON.stringify(source.key)}:[`);
          let first = true;
          for (let page = 0; page < MAX_PAGES; page++) {
            const rows = await readPage(ctx, source, page);
            for (const row of rows) {
              write(`${first ? "" : ","}\n${JSON.stringify(row)}`);
              first = false;
            }
            if (rows.length < PAGE) break;
          }
          write("]");
        }
        write("}\n");
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
