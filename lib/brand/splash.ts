/** iPhone portrait screens (points and pixel ratio) for Home Screen launch images. */
export const SPLASH_DEVICES = [
  { w: 440, h: 956, dpr: 3 }, // 16 Pro Max
  { w: 402, h: 874, dpr: 3 }, // 16 Pro
  { w: 430, h: 932, dpr: 3 }, // 16 Plus, 15 Pro Max, 15 Plus, 14 Pro Max
  { w: 393, h: 852, dpr: 3 }, // 16, 15, 15 Pro, 14 Pro
  { w: 390, h: 844, dpr: 3 }, // 14, 13, 13 Pro, 12, 12 Pro
  { w: 375, h: 812, dpr: 3 }, // 13 mini, 12 mini, 11 Pro, X, XS
  { w: 414, h: 896, dpr: 2 }, // 11, XR
  { w: 375, h: 667, dpr: 2 }, // SE, 8
] as const;

export const SPLASH_BG = { light: "#f5f3ee", dark: "#0a0d0c" } as const;

export function splashSpec(d: (typeof SPLASH_DEVICES)[number], scheme: "light" | "dark") {
  return `${d.w * d.dpr}x${d.h * d.dpr}-${scheme}`;
}

export function splashStartupImages() {
  return SPLASH_DEVICES.flatMap((d) =>
    (["light", "dark"] as const).map((scheme) => ({
      url: `/splash/${splashSpec(d, scheme)}`,
      media: `screen and (device-width: ${d.w}px) and (device-height: ${d.h}px) and (-webkit-device-pixel-ratio: ${d.dpr}) and (orientation: portrait) and (prefers-color-scheme: ${scheme})`,
    })),
  );
}
