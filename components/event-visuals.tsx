import type { EventKind } from "@/lib/domain/events";
import type { UsualIcon } from "@/lib/domain/usual-foods";
import {
  CupIcon,
  DropIcon,
  DumbbellIcon,
  FeatherIcon,
  HeartIcon,
  MoonIcon,
  NoteIcon,
  PlateIcon,
  ScaleIcon,
  SeatIcon,
  SpoonIcon,
  SunIcon,
  WalkIcon,
  WindIcon,
  AlertIcon,
  ClockIcon,
  LeafIcon,
  SeedsIcon,
  NapIcon,
  BarIcon,
  BowlIcon,
  EggIcon,
  FruitIcon,
  NutsIcon,
  ScoopIcon,
} from "./icons";

type Visual = { Icon: (p: { className?: string }) => React.ReactNode; tint: string };

/** Icon and color for each kind of log, used by the timeline and history. */
export const EVENT_VISUALS: Record<EventKind, Visual> = {
  meal: { Icon: PlateIcon, tint: "bg-fuel/15 text-fuel" },
  toilet: { Icon: SeatIcon, tint: "bg-gut/15 text-gut" },
  water: { Icon: DropIcon, tint: "bg-rest/15 text-rest" },
  drink: { Icon: CupIcon, tint: "bg-fuel/15 text-fuel" },
  isabgol: { Icon: SpoonIcon, tint: "bg-gut/15 text-gut" },
  wake: { Icon: SunIcon, tint: "bg-fuel/15 text-fuel" },
  sleep: { Icon: MoonIcon, tint: "bg-rest/15 text-rest" },
  nap: { Icon: NapIcon, tint: "bg-rest/15 text-rest" },
  practice: { Icon: FeatherIcon, tint: "bg-gut/15 text-gut" },
  sensation: { Icon: FeatherIcon, tint: "bg-surface-3 text-ink-2" },
  gas: { Icon: WindIcon, tint: "bg-surface-3 text-ink-2" },
  walk: { Icon: WalkIcon, tint: "bg-move/15 text-move" },
  workout: { Icon: DumbbellIcon, tint: "bg-move/15 text-move" },
  weigh_in: { Icon: ScaleIcon, tint: "bg-surface-3 text-ink-2" },
  mood: { Icon: HeartIcon, tint: "bg-surface-3 text-ink-2" },
  stress: { Icon: HeartIcon, tint: "bg-surface-3 text-ink-2" },
  intimacy: { Icon: HeartIcon, tint: "bg-surface-3 text-ink-2" },
  late_work: { Icon: ClockIcon, tint: "bg-surface-3 text-ink-2" },
  symptom: { Icon: AlertIcon, tint: "bg-care/15 text-care" },
  note: { Icon: NoteIcon, tint: "bg-surface-3 text-ink-2" },
};

/** Icons a usual food can wear on its one-tap button. */
export const USUAL_ICON: Record<UsualIcon, Visual["Icon"]> = {
  bar: BarIcon,
  fruit: FruitIcon,
  scoop: ScoopIcon,
  bowl: BowlIcon,
  cup: CupIcon,
  nuts: NutsIcon,
  egg: EggIcon,
  plate: PlateIcon,
};

/** Drinks made with water get their own look, so amla and chia stand out from tea. */
const DRINK_VISUALS: Record<string, Visual> = {
  amla: { Icon: LeafIcon, tint: "bg-move/15 text-move" },
  chia: { Icon: SeedsIcon, tint: "bg-rest/15 text-rest" },
};

export function EventIcon({ kind, size = "md", drink }: { kind: EventKind; size?: "sm" | "md"; drink?: string }) {
  const v = (kind === "drink" && drink ? DRINK_VISUALS[drink] : undefined) ?? EVENT_VISUALS[kind] ?? EVENT_VISUALS.note;
  const box = size === "sm" ? "size-8 rounded-xl" : "size-10 rounded-2xl";
  const icon = size === "sm" ? "size-4" : "size-5";
  return (
    <span className={`flex shrink-0 items-center justify-center ${box} ${v.tint}`}>
      <v.Icon className={icon} />
    </span>
  );
}
