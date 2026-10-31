"use client";

import { useSyncExternalStore } from "react";
import type { Pose } from "@/lib/content/poses";

/**
 * Animated line drawings for each exercise and position. Built with SVG and its own
 * animation elements (no video, no script, no outside service), so they work offline,
 * load instantly and pass the strict security policy. Motion stops when the phone asks
 * for reduced motion.
 */

export type { Pose } from "@/lib/content/poses";

const LABEL: Record<Pose, string> = {
  toilet: "Sitting on the toilet with feet on a stool, leaning forward, breathing out",
  figure4: "Seated figure-4 stretch: ankle over the other knee, leaning forward",
  gravity_drain: "Lying on the back with knees pulled wide toward the armpits",
  squeeze_drop: "The pelvic floor lifts gently, then lets go and drops",
  hips_up: "Kneeling with chest down and hips up, belly loose",
  knees_to_chest: "Lying on the back hugging both knees, rocking gently",
  belly_circles: "Fingertips circling the belly: up the right side, across, down the left",
  left_side: "Lying on the left side with the top knee drawn up",
  belly_breath: "Lying with knees bent, hand on belly: belly rises on the in-breath",
};

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

const BODY = { className: "stroke-ink", strokeWidth: 6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
const PROP = { className: "stroke-ink-3", strokeWidth: 4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none", strokeOpacity: 0.55 };
const ACCENT = { className: "stroke-brand", strokeWidth: 5, strokeLinecap: "round" as const, fill: "none" };
const EASE = "0.45 0 0.55 1";

function Head({ cx, cy, r = 11 }: { cx: number; cy: number; r?: number }) {
  return <circle cx={cx} cy={cy} r={r} className="fill-surface stroke-ink" strokeWidth={5} />;
}

function Floor() {
  return <path d="M20 132 H220" {...PROP} />;
}

/** Morphs a path between shapes. All shapes must use the same commands. */
function Morph({ values, dur, keyTimes, on }: { values: string[]; dur: string; keyTimes?: string; on: boolean }) {
  if (!on) return null;
  const times = keyTimes ?? values.map((_, i) => (i / (values.length - 1)).toFixed(3)).join(";");
  return (
    <animate
      attributeName="d"
      dur={dur}
      repeatCount="indefinite"
      values={values.join(";")}
      keyTimes={times}
      calcMode="spline"
      keySplines={Array(values.length - 1).fill(EASE).join(";")}
    />
  );
}

function Spin({ values, dur, keyTimes, on }: { values: string; dur: string; keyTimes?: string; on: boolean }) {
  if (!on) return null;
  const count = values.split(";").length;
  return (
    <animateTransform
      attributeName="transform"
      type="rotate"
      dur={dur}
      repeatCount="indefinite"
      values={values}
      keyTimes={keyTimes ?? Array.from({ length: count }, (_, i) => (i / (count - 1)).toFixed(3)).join(";")}
      calcMode="spline"
      keySplines={Array(count - 1).fill(EASE).join(";")}
    />
  );
}

function Fade({ values, keyTimes, dur, on }: { values: string; keyTimes: string; dur: string; on: boolean }) {
  if (!on) return null;
  return <animate attributeName="opacity" dur={dur} repeatCount="indefinite" values={values} keyTimes={keyTimes} />;
}

/** "Mooo" out-breath: three arcs that appear one by one, then a soft label. */
function OutBreath({ x, y, on, dur = "6s" }: { x: number; y: number; on: boolean; dur?: string }) {
  return (
    <g className="stroke-brand" strokeWidth={3} strokeLinecap="round" fill="none">
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M${x + i * 8} ${y - 5 - i * 2} q${5 + i} ${5 + i * 2} 0 ${10 + i * 4}`} opacity={on ? 0 : 1}>
          <Fade on={on} dur={dur} values="0;0;1;1;0" keyTimes={`0;${(0.3 + i * 0.12).toFixed(2)};${(0.42 + i * 0.12).toFixed(2)};0.9;1`} />
        </path>
      ))}
      <text x={x + 2} y={y + 24} className="fill-brand stroke-none" fontSize="11" fontWeight="600">
        mooo
        <Fade on={on} dur={dur} values="0;0;1;1;0" keyTimes="0;0.35;0.5;0.9;1" />
      </text>
    </g>
  );
}

function Toilet({ on }: { on: boolean }) {
  return (
    <>
      <path d="M86 132 H122" {...PROP} />
      <rect x="58" y="50" width="18" height="48" rx="5" {...PROP} />
      <path d="M72 97 H132" {...PROP} strokeWidth={5} />
      <path d="M80 99 Q84 128 104 130 Q122 128 126 99" {...PROP} />
      <rect x="140" y="110" width="50" height="20" rx="5" {...PROP} />
      <g>
        <Spin on={on} dur="6s" values="0 102 93; -4 102 93; -4 102 93; 0 102 93" keyTimes="0;0.3;0.85;1" />
        <path d="M102 93 L132 54" {...BODY} />
        <Head cx={143} cy={42} />
        <path d="M132 56 L141 80 L162 70" {...BODY} strokeWidth={5} />
      </g>
      <path d="M102 93 L146 82 L156 110 L176 110" {...BODY} />
      <OutBreath x={158} y={40} on={on} />
    </>
  );
}

function Figure4({ on }: { on: boolean }) {
  return (
    <>
      <path d="M66 94 H124 M70 94 V132 M120 94 V132 M66 94 V46" {...PROP} />
      <path d="M88 90 L134 90 L136 128 L152 128" {...BODY} />
      <path d="M88 88 L112 74 L138 84 L148 79" {...BODY} strokeWidth={5.5} />
      <g>
        <Spin on={on} dur="7s" values="0 88 90; 20 88 90; 20 88 90; 0 88 90" keyTimes="0;0.35;0.8;1" />
        <path d="M88 90 L92 44" {...BODY} />
        <Head cx={94} cy={30} />
        <path d="M92 48 L106 70 L124 80" {...BODY} strokeWidth={5} />
      </g>
    </>
  );
}

function GravityDrain({ on }: { on: boolean }) {
  const belly = ["M74 117 Q94 112 114 118", "M74 117 Q94 101 114 118", "M74 117 Q94 112 114 118"];
  return (
    <>
      <Floor />
      <Head cx={44} cy={114} />
      <path d="M58 120 Q92 124 124 122" {...BODY} />
      <path d="M124 122 L102 84 L126 52 L140 50" {...BODY} />
      <path d="M60 118 L78 96 L116 64" {...BODY} strokeWidth={5} />
      <path d={belly[0]} {...ACCENT}>
        <Morph on={on} dur="10s" values={belly} keyTimes="0;0.4;1" />
      </path>
    </>
  );
}

function SqueezeDrop({ on }: { on: boolean }) {
  const rest = "M84 104 Q120 120 156 104";
  const lifted = "M84 104 Q120 100 156 104";
  const dropped = "M84 104 Q120 134 156 104";
  return (
    <>
      <path d="M62 34 Q48 84 84 104" {...PROP} strokeWidth={5} />
      <path d="M178 34 Q192 84 156 104" {...PROP} strokeWidth={5} />
      <path d={rest} {...ACCENT} strokeWidth={7}>
        <Morph on={on} dur="12s" values={[rest, lifted, dropped, dropped, rest]} keyTimes="0;0.16;0.45;0.92;1" />
      </path>
      <path d="M120 122 V136 M113 130 L120 137 L127 130" {...ACCENT} strokeWidth={3.5} opacity={on ? 0 : 0.8}>
        <Fade on={on} dur="12s" values="0;0;0.9;0.9;0" keyTimes="0;0.2;0.35;0.85;1" />
      </path>
      <text x="120" y="24" textAnchor="middle" className="fill-ink-2" fontSize="13" fontWeight="600" opacity={on ? 1 : 0}>
        Lift gently, 2 s
        <Fade on={on} dur="12s" values="1;1;0;0;1" keyTimes="0;0.16;0.2;0.97;1" />
      </text>
      <text x="120" y="24" textAnchor="middle" className="fill-brand" fontSize="13" fontWeight="600" opacity={on ? 0 : 1}>
        Let it all go, 10 s
        <Fade on={on} dur="12s" values="0;0;1;1;0" keyTimes="0;0.17;0.22;0.95;1" />
      </text>
    </>
  );
}

function HipsUp({ on }: { on: boolean }) {
  const belly = ["M140 94 Q124 106 104 112", "M140 94 Q124 116 104 112", "M140 94 Q124 106 104 112"];
  return (
    <>
      <Floor />
      <path d="M194 130 L150 130 L150 86 L92 116" {...BODY} />
      <Head cx={78} cy={121} r={10} />
      <path d="M96 117 L112 128 L140 128" {...BODY} strokeWidth={5} />
      <path d={belly[0]} {...ACCENT}>
        <Morph on={on} dur="9s" values={belly} keyTimes="0;0.45;1" />
      </path>
    </>
  );
}

function KneesToChest({ on }: { on: boolean }) {
  return (
    <>
      <Floor />
      <g>
        <Spin on={on} dur="4s" values="0 94 122; -5 94 122; 0 94 122; 5 94 122; 0 94 122" />
        <Head cx={48} cy={114} />
        <path d="M62 120 Q94 124 126 122" {...BODY} />
        <path d="M126 122 L100 82 L132 80 L142 74" {...BODY} />
        <path d="M64 118 L82 98 L114 82" {...BODY} strokeWidth={5} />
      </g>
    </>
  );
}

function BellyCircles({ on }: { on: boolean }) {
  const route = "M94 112 V72 Q94 60 106 60 H134 Q146 60 146 72 V112";
  return (
    <>
      <path d="M72 18 Q64 72 78 134" {...PROP} strokeWidth={5} />
      <path d="M168 18 Q176 72 162 134" {...PROP} strokeWidth={5} />
      <path d="M88 44 Q120 58 152 44" {...PROP} strokeWidth={3} strokeOpacity={0.35} />
      <circle cx="120" cy="88" r="2.5" className="fill-ink-3" />
      <path d={route} className="stroke-brand" strokeWidth={3} strokeDasharray="2 7" strokeLinecap="round" fill="none" strokeOpacity={0.6} />
      <path d="M140 104 L146 112 L152 104" className="stroke-brand" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeOpacity={0.6} />
      <circle r="7" cx={on ? 0 : 94} cy={on ? 0 : 112} className="fill-brand" opacity={0.9}>
        {on ? <animateMotion dur="6s" repeatCount="indefinite" path={route} /> : null}
      </circle>
      <text x="84" y="146" textAnchor="middle" className="fill-ink-3" fontSize="11">
        Your right
      </text>
      <text x="156" y="146" textAnchor="middle" className="fill-ink-3" fontSize="11">
        Your left
      </text>
    </>
  );
}

function LeftSide({ on }: { on: boolean }) {
  const ribs = ["M78 110 Q98 106 116 112", "M78 110 Q98 98 116 112", "M78 110 Q98 106 116 112"];
  return (
    <>
      <Floor />
      <rect x="24" y="114" width="36" height="14" rx="7" {...PROP} />
      <Head cx={46} cy={104} />
      <path d="M60 114 Q94 110 128 116" {...BODY} />
      <path d="M128 118 L170 122 L208 126" {...BODY} strokeWidth={5.5} />
      <path d="M128 114 L158 92 L188 108" {...BODY} />
      <path d="M66 110 L92 104 L110 118" {...BODY} strokeWidth={5} />
      <path d={ribs[0]} {...ACCENT} strokeWidth={4}>
        <Morph on={on} dur="10s" values={ribs} keyTimes="0;0.4;1" />
      </path>
    </>
  );
}

function BellyBreath({ on }: { on: boolean }) {
  const belly = ["M74 117 Q96 109 118 118", "M74 117 Q96 97 118 118", "M74 117 Q96 109 118 118"];
  const times = "0;0.36;1";
  return (
    <>
      <Floor />
      <Head cx={44} cy={114} />
      <path d="M58 120 Q92 124 126 122" {...BODY} />
      <path d="M126 122 L156 90 L182 128 L196 128" {...BODY} />
      <path d={belly[0]} {...ACCENT}>
        <Morph on={on} dur="11s" values={belly} keyTimes={times} />
      </path>
      <g>
        {on ? (
          <animateTransform attributeName="transform" type="translate" dur="11s" repeatCount="indefinite" values="0 0; 0 -9; 0 0" keyTimes={times} calcMode="spline" keySplines={`${EASE};${EASE}`} />
        ) : null}
        <path d="M60 118 L74 100 L96 106" {...BODY} strokeWidth={5} />
      </g>
      <path d="M134 98 V110 M128 105 L134 111 L140 105" {...ACCENT} strokeWidth={3} opacity={on ? 0 : 0.8}>
        <Fade on={on} dur="11s" values="0;0.9;0.9;0" keyTimes="0;0.1;0.36;0.5" />
      </path>
      <text x="120" y="30" textAnchor="middle" className="fill-ink-2" fontSize="12" fontWeight="600" opacity={on ? 1 : 0}>
        In for 4: belly rises, floor drops
        <Fade on={on} dur="11s" values="1;1;0;0;1" keyTimes="0;0.34;0.38;0.97;1" />
      </text>
      <text x="120" y="30" textAnchor="middle" className="fill-brand" fontSize="12" fontWeight="600" opacity={on ? 0 : 1}>
        Out for 7: slow, stay soft below
        <Fade on={on} dur="11s" values="0;0;1;1;0" keyTimes="0;0.36;0.4;0.95;1" />
      </text>
    </>
  );
}

const POSES: Record<Pose, (p: { on: boolean }) => React.ReactNode> = {
  toilet: Toilet,
  figure4: Figure4,
  gravity_drain: GravityDrain,
  squeeze_drop: SqueezeDrop,
  hips_up: HipsUp,
  knees_to_chest: KneesToChest,
  belly_circles: BellyCircles,
  left_side: LeftSide,
  belly_breath: BellyBreath,
};

export function ExerciseFigure({ pose, className = "h-40 w-full", mirror = false }: { pose: Pose; className?: string; mirror?: boolean }) {
  const reduced = useReducedMotion();
  const Draw = POSES[pose];
  return (
    <svg viewBox="0 0 240 150" className={className} role="img" aria-label={LABEL[pose]}>
      <g transform={mirror ? "translate(240 0) scale(-1 1)" : undefined}>
        <Draw on={!reduced} />
      </g>
    </svg>
  );
}
