"use client";

import { useRef, useState } from "react";
import { logEvent } from "@/lib/client/log";
import { prepareMealPhoto } from "@/lib/client/photo";
import { CameraIcon, ImageIcon } from "../icons";
import { useToast } from "../toast";
import { CornerPill, Tile } from "./quick-tiles";

/**
 * One tap opens the camera; the photo is shrunk on the phone and logged at once.
 * The corner button picks earlier photos from the library and keeps each photo's
 * real "date taken", so meals logged later land at the right time.
 */
export function MealTile({ sub }: { sub: string }) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { show, logged } = useToast();

  async function handle(files: FileList | null, fromCamera: boolean) {
    if (!files || files.length === 0) return;
    setBusy(true);
    let failed = 0;
    try {
      // One unreadable photo never stops the rest of the pick.
      for (const file of Array.from(files).slice(0, 6)) {
        try {
          const { blob, takenAt } = await prepareMealPhoto(file, fromCamera);
          logged(await logEvent("meal", {}, { at: takenAt ?? new Date(), photo: blob }), "Meal saved. Details appear in a few seconds.");
        } catch {
          failed += 1;
        }
      }
      if (failed > 0) show(`Could not read ${failed === 1 ? "one photo" : `${failed} photos`}. Try again, or describe the meal from Earlier entry.`, "tip");
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = "";
      if (library.current) library.current.value = "";
    }
  }

  return (
    <>
      <Tile
        icon={<CameraIcon className="size-6" />}
        tint="bg-fuel/15 text-fuel"
        title={busy ? "Saving..." : "Meal"}
        sub={sub}
        onClick={() => camera.current?.click()}
        label="Photograph a meal"
        corner={
          <CornerPill onClick={() => library.current?.click()} label="Add meal photos from your library">
            <ImageIcon className="size-4" />
          </CornerPill>
        }
      />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void handle(e.target.files, true)} />
      <input ref={library} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void handle(e.target.files, false)} />
    </>
  );
}
