/**
 * Shown the instant a tab is tapped, while the screen arrives. Bottom-nav tabs are also
 * prefetched in full (bottom-nav.tsx), so most taps never see this.
 */
export default function Loading() {
  const block = "animate-pulse rounded-[22px] bg-surface";
  return (
    <main className="flex flex-col gap-4 pt-2" aria-busy="true" aria-label="Loading">
      <div className="mt-1 h-3 w-32 animate-pulse rounded-full bg-surface" />
      <div className="h-8 w-48 animate-pulse rounded-full bg-surface" />
      <div className={`${block} mt-2 h-24`} />
      <div className={`${block} h-20`} />
      <div className={`${block} h-20`} />
    </main>
  );
}
