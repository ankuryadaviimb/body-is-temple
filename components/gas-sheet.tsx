"use client";

import { logEvent } from "@/lib/client/log";
import { Choice, Sheet } from "./sheet";
import { useToast } from "./toast";

/** One-tap gas rating, 0 to 4. Used on Today and in coach answers. */
export function GasSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { logged } = useToast();
  return (
    <Sheet open={open} title="How gassy do you feel?" onClose={onClose}>
      <Choice
        label="0 is none, 4 is very bloated"
        value={undefined}
        onChange={async (level: number) => {
          onClose();
          logged(await logEvent("gas", { level }), `Gas ${level} of 4 logged.`);
        }}
        options={[
          { value: 0, label: "0 · None" },
          { value: 1, label: "1" },
          { value: 2, label: "2" },
          { value: 3, label: "3" },
          { value: 4, label: "4 · Very" },
        ]}
      />
    </Sheet>
  );
}
