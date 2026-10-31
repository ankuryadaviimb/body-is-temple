import "server-only";
import { appendNote, MEMORY_SLUGS, type MemoryFile, type MemorySlug } from "@/lib/domain/memory";
import type { AuthedContext } from "@/lib/supabase/server";

export async function loadMemory({ supabase, userId }: AuthedContext): Promise<MemoryFile[]> {
  const { data, error } = await supabase
    .from("memory_files")
    .select("slug, content, version, updated_at")
    .eq("user_id", userId);
  if (error) throw new Error("memory_read_failed");
  return (data ?? []).filter((r) => (MEMORY_SLUGS as readonly string[]).includes(r.slug as string)) as MemoryFile[];
}

/** Saves a note and records the new version (one database call, under RLS). */
export async function saveMemory(
  { supabase }: AuthedContext,
  slug: MemorySlug,
  content: string,
  source: "user" | "remember",
): Promise<number> {
  const { data, error } = await supabase.rpc("save_memory", { p_slug: slug, p_content: content, p_source: source });
  if (error) throw new Error("memory_write_failed");
  return typeof data === "number" ? data : 0;
}

/** "Remember this": adds a dated line to the notes file. */
export async function rememberNote(ctx: AuthedContext, text: string, day: string): Promise<MemoryFile[]> {
  const files = await loadMemory(ctx);
  const current = files.find((f) => f.slug === "notes")?.content ?? "";
  const next = appendNote(current, text, day);
  if (next !== current) await saveMemory(ctx, "notes", next, "remember");
  return loadMemory(ctx);
}
