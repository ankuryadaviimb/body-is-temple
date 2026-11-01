import { autoProtein } from "@/lib/domain/nutrition";
import { SettingsUpdate } from "@/lib/domain/settings";
import { assertWriteAllowed, handleError, json, readJson } from "@/lib/http/guard";
import { replaceAllDays } from "@/lib/server/events";
import { loadSettings, saveSettings } from "@/lib/server/settings";
import { requireUser } from "@/lib/supabase/server";

export async function GET() {
  try {
    const ctx = await requireUser();
    return json({ settings: await loadSettings(ctx) });
  } catch (err) {
    return handleError(err, "settings.get");
  }
}

/** Partial update of user-editable settings. Server-managed fields cannot be set here. */
export async function PUT(req: Request) {
  try {
    assertWriteAllowed(req);
    const ctx = await requireUser();
    const update = await readJson(req, SettingsUpdate, 16_000);
    const current = await loadSettings(ctx);
    const next = { ...current, ...update };
    // Auto protein follows weight and height; a custom target stays as typed.
    if (next.protein_auto) next.protein_target_g = autoProtein(next.weight_kg, next.height_cm)?.grams ?? null;
    const saved = await saveSettings(ctx, next);
    // A new time zone or day start changes which day each entry belongs to.
    if (saved.tz !== current.tz || saved.day_start_hour !== current.day_start_hour) {
      await replaceAllDays(ctx, saved, new Date().toISOString());
    }
    return json({ settings: saved });
  } catch (err) {
    return handleError(err, "settings.put");
  }
}
