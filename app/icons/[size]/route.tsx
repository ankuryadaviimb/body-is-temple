import { ImageResponse } from "next/og";
import { IconArt } from "@/lib/brand/icon-art";

const SIZES = new Set([192, 512]);

/** PNG icons for the web app manifest: /icons/192 and /icons/512. */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  return new ImageResponse(<IconArt size={size} />, {
    width: size,
    height: size,
    headers: { "cache-control": "public, max-age=604800, immutable" },
  });
}
