"use client";

import { useRef, useState } from "react";
import { logEvent } from "@/lib/client/log";
import { prepareMealPhoto } from "@/lib/client/photo";
import { CameraIcon, PlateIcon } from "../icons";
import { useToast } from "../toast";
import { MealSheet } from "./meal-composer";
import { CornerPill, Tile } from "./quick-tiles";

/**
 * The Meal tile opens every way to log food at once (type, photo, photos, usual foods),
 * because most meals get typed. The camera corner button stays one tap from Today.
 */
export function MealTile({ sub }: { sub: string }) {
  const camera = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { show, logged } = useToast();

  async function snap(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { blob, takenAt } = await prepareMealPhoto(file, true);
      logged(await logEvent("meal", {}, { at: takenAt ?? new Date(), photo: blob }), "Meal saved. Details appear in a few seconds.");
    } catch {
      show("Could not read that photo. Try again, or type the meal.", "tip");
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = "";
    }
  }

  return (
    <>
      <Tile
        icon={<PlateIcon className="size-6" />}
        tint="bg-fuel/15 text-fuel"
        title={busy ? "Saving..." : "Meal"}
        sub={sub}
        onClick={() => setOpen(true)}
        label="Log a meal: type it, take a photo, or tap a usual food"
        corner={
          <CornerPill onClick={() => camera.current?.click()} label="Take a meal photo now">
            <CameraIcon className="size-4" />
          </CornerPill>
        }
      />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void snap(e.target.files)} />
      <MealSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
