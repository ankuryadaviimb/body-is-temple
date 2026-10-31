import type { Ring } from "@/lib/domain/rings";

const COLOR: Record<Ring["id"], string> = {
  gut: "text-gut",
  fuel: "text-fuel",
  move: "text-move",
  rest: "text-rest",
};

/**
 * A ring split into segments. Done segments are filled, open ones are faint, and
 * segments with no data yet are dashed. Drawn with SVG attributes only (CSP safe).
 */
export function RingView({ ring, size = 64 }: { ring: Ring; size?: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const n = ring.segments.length;
  const gap = n > 1 ? 5 : 0;
  const seg = c / n - gap;
  const done = ring.segments.filter((s) => s.done === true).length;
  const applicable = ring.segments.filter((s) => s.done !== null).length;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 64 64" width={size} height={size} className={COLOR[ring.id]} role="img">
        <title>{`${ring.label}: ${done} of ${applicable || n} done`}</title>
        {ring.segments.map((s, i) => (
          <circle
            key={s.id}
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${seg} ${c - seg}`}
            strokeDashoffset={-(i * (seg + gap)) + c / 4}
            opacity={s.done === true ? 1 : s.done === false ? 0.18 : 0.1}
          />
        ))}
        <text x="32" y="36.5" textAnchor="middle" className="fill-current" fontSize="13" fontWeight="600">
          {done}/{applicable || n}
        </text>
      </svg>
      <span className="text-xs font-medium text-ink-2">{ring.label}</span>
    </div>
  );
}
