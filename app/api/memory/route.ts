import { MemoryUpdate, RememberInput } from "@/lib/domain/memory";
import { assertWriteAllowed, handleError, json, rateLimit, readJson } from "@/lib/http/guard";
import { loadMemory, rememberNote, saveMemory } from "@/lib/server/memory";
import { loadSettings } from "@/lib/server/settings";
import { currentDay } from "@/lib/server/today";
import { requireUser } from "@/lib/supabase/server";

/** GET /api/memory: the coach's memory notes. */
export async function GET() {
  try {
    const ctx = await requireUser();
    return json({ files: await loadMemory(ctx) });
  } catch (err) {
    return handleError(err, "memory.get");
  }
}

/** PUT /api/memory with { slug, content }: edit one note (a new version is kept). */
export async function PUT(req: Request) {
  try {
    assertWriteAllowed(req);
    const ctx = await requireUser();
    rateLimit(`memory:${ctx.userId}`, 60, 60 * 60_000);
    const { slug, content } = await readJson(req, MemoryUpdate, 12_000);
    await saveMemory(ctx, slug, content.trim(), "user");
    return json({ files: await loadMemory(ctx) });
  } catch (err) {
    return handleError(err, "memory.put");
  }
}

/** POST /api/memory with { text }: "Remember this", added to the notes file. */
export async function POST(req: Request) {
  try {
    assertWriteAllowed(req);
    const ctx = await requireUser();
    rateLimit(`memory:${ctx.userId}`, 60, 60 * 60_000);
    const { text } = await readJson(req, RememberInput, 2_000);
    const day = await currentDay(ctx, await loadSettings(ctx));
    return json({ files: await rememberNote(ctx, text, day) });
  } catch (err) {
    return handleError(err, "memory.post");
  }
}
