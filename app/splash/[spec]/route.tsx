import { ImageResponse } from "next/og";
import { SPLASH_BG, SPLASH_DEVICES, splashSpec } from "@/lib/brand/splash";

const VALID = new Set(SPLASH_DEVICES.flatMap((d) => [splashSpec(d, "light"), splashSpec(d, "dark")]));

/** Branded launch image for the iOS Home Screen app, so it never flashes white on open. */
export async function GET(_req: Request, { params }: { params: Promise<{ spec: string }> }) {
  const spec = (await params).spec;
  if (!VALID.has(spec)) return new Response("Not found", { status: 404 });
  const [size, scheme] = spec.split("-") as [string, "light" | "dark"];
  const [width, height] = size.split("x").map(Number);
  const mark = Math.round(width * 0.22);
  const ring = Math.round(mark * 0.47);
  const stroke = Math.max(4, Math.round(mark * 0.07));
  const dot = Math.round(mark * 0.16);
  return new ImageResponse(
    (
      <div
        style={{
          width,
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: SPLASH_BG[scheme],
        }}
      >
        <div
          style={{
            width: mark,
            height: mark,
            borderRadius: Math.round(mark * 0.28),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(145deg, #14b8a6 0%, #0b5d57 100%)",
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
      </div>
    ),
    { width, height, headers: { "cache-control": "public, max-age=604800, immutable" } },
  );
}
