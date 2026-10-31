import { SettingsUpdate, startingProteinTarget } from "@/lib/domain/settings";
import { assertWriteAllowed, handleError, json, readJson } from "@/lib/http/guard";
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
    if (update.weight_kg !== undefined && update.protein_target_g === undefined && current.protein_target_g === null) {
      next.protein_target_g = startingProteinTarget(next.weight_kg);
    }
    return json({ settings: await saveSettings(ctx, next) });
  } catch (err) {
    return handleError(err, "settings.put");
  }
}
