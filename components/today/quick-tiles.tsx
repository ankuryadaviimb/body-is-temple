import Link from "next/link";

/** Building blocks for the Today screen's quick-log area. */

const TILE = "pressable relative flex h-[136px] w-full flex-col justify-between rounded-[24px] bg-surface p-4 text-left shadow-card";

export function Tile({
  icon,
  tint,
  title,
  sub,
  onClick,
  href,
  corner,
  footer,
  label,
}: {
  icon: React.ReactNode;
  tint: string;
  title: string;
  sub: string;
  onClick?: () => void;
  href?: string;
  corner?: React.ReactNode;
  footer?: React.ReactNode;
  label?: string;
}) {
  const body = (
    <>
      <span className={`flex size-11 items-center justify-center rounded-2xl ${tint}`}>{icon}</span>
      <span className="block">
        <span className="block text-[17px] font-semibold tracking-tight">{title}</span>
        <span className="mt-0.5 block truncate text-[13px] text-ink-2">{sub}</span>
        {footer ? <span className="mt-2 block">{footer}</span> : null}
      </span>
    </>
  );
  return (
    <div className="relative">
      {href ? (
        <Link href={href} className={TILE} aria-label={label}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={TILE} aria-label={label}>
          {body}
        </button>
      )}
      {corner ? <div className="absolute right-3 top-3">{corner}</div> : null}
    </div>
  );
}

/** Thin progress bar drawn with SVG attributes (no inline styles, CSP safe). */
export function ProgressBar({ value, max, colorClass }: { value: number; max: number; colorClass: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <svg viewBox="0 0 100 4" preserveAspectRatio="none" className={`block h-1.5 w-full ${colorClass}`} aria-hidden>
      <rect x="0" y="0" width="100" height="4" rx="2" fill="currentColor" fillOpacity="0.15" />
      {pct > 0 ? <rect x="0" y="0" width={pct} height="4" rx="2" fill="currentColor" /> : null}
    </svg>
  );
}

export function CornerPill({ children, onClick, label }: { children: React.ReactNode; onClick?: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="pressable flex h-8 items-center gap-1 rounded-full bg-surface-2 px-2.5 text-xs font-semibold text-ink-2"
    >
      {children}
    </button>
  );
}

export function RailButton({
  icon,
  tint,
  label,
  onClick,
  href,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      <span className={`flex size-12 items-center justify-center rounded-full ${tint}`}>{icon}</span>
      <span className="w-full truncate text-center text-[11px] font-medium text-ink-2">{label}</span>
    </>
  );
  const cls = "pressable flex min-w-0 flex-col items-center gap-1.5";
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between px-1">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-3">{children}</h2>
      {right ? <span className="text-[13px] text-ink-3">{right}</span> : null}
    </div>
  );
}
