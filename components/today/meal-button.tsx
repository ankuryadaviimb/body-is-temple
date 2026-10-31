"use client";

import { useRef, useState } from "react";
import { logEvent } from "@/lib/client/log";
import { prepareMealPhoto } from "@/lib/client/photo";
import { CameraIcon, ImageIcon } from "../icons";
import { useToast } from "../toast";

/**
 * One tap opens the camera; the photo is shrunk on the phone and logged at once.
 * The small button picks earlier photos from the library and keeps each photo's
 * real "date taken", so meals logged later land at the right time.
 */
export function MealButtons() {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { show, showFeedback } = useToast();

  async function handle(files: FileList | null, fromCamera: boolean) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files).slice(0, 6)) {
        const { blob, takenAt } = await prepareMealPhoto(file, fromCamera);
        const { feedback } = await logEvent("meal", {}, { at: takenAt ?? new Date(), photo: blob });
        showFeedback(feedback, "Meal saved. Details appear in a few seconds.");
      }
    } catch {
      show("Could not read that photo. Try again, or describe the meal from More.", "tip");
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = "";
      if (library.current) library.current.value = "";
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => camera.current?.click()}
        disabled={busy}
        className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-3xl bg-fuel/15 font-semibold text-ink disabled:opacity-60"
      >
        <CameraIcon className="size-8 text-fuel" />
        {busy ? "Saving..." : "Meal"}
      </button>
      <button
        type="button"
        onClick={() => library.current?.click()}
        disabled={busy}
        aria-label="Add meal photos from your library"
        className="absolute right-2 top-2 rounded-full bg-surface/80 p-1.5 text-ink-2"
      >
        <ImageIcon className="size-5" />
      </button>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handle(e.target.files, true)}
      />
      <input
        ref={library}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void handle(e.target.files, false)}
      />
    </div>
  );
}
