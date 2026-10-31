import "server-only";
import { SettingsSchema, withDefaults, type Settings } from "@/lib/domain/settings";
import type { AuthedContext } from "@/lib/supabase/server";

export async function loadSettings({ supabase, userId }: AuthedContext): Promise<Settings> {
  const { data, error } = await supabase.from("settings").select("data").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("settings_read_failed");
  return withDefaults(data?.data);
}

export async function saveSettings({ supabase, userId }: AuthedContext, settings: Settings): Promise<Settings> {
  const valid = SettingsSchema.parse(settings);
  const { error } = await supabase
    .from("settings")
    .upsert({ user_id: userId, data: valid }, { onConflict: "user_id" });
  if (error) throw new Error("settings_write_failed");
  return valid;
}
