/**
 * App icon artwork for ImageResponse (rendered at build or request time, no binary assets).
 * A breathing ring on teal: the app's core gesture, a slow breath out.
 */
export function IconArt({ size }: { size: number }) {
  const ring = Math.round(size * 0.56);
  const stroke = Math.max(2, Math.round(size * 0.075));
  const dot = Math.round(size * 0.16);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(145deg, #12867d 0%, #0b5d57 100%)",
      }}
    >
      <div
        style={{
          width: ring,
          height: ring,
          borderRadius: ring,
          border: `${stroke}px solid rgba(255,255,255,0.95)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ width: dot, height: dot, borderRadius: dot, background: "rgba(255,255,255,0.95)" }} />
      </div>
    </div>
  );
}
