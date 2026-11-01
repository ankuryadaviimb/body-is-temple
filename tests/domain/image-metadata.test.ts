import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stripImageMetadata } from "@/lib/domain/image-metadata";

/** Synthetic images (a flat color) carrying fake camera, GPS and text metadata. */
const load = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/images/${name}`));
const has = (b: Uint8Array, text: string) => Buffer.from(b).includes(Buffer.from(text, "latin1"));

describe("photo metadata removal", () => {
  it("removes EXIF (with GPS) and comments from a JPEG and keeps the picture", () => {
    const raw = load("exif.jpg");
    expect(has(raw, "Exif")).toBe(true);
    expect(has(raw, "secret comment")).toBe(true);
    const out = stripImageMetadata(raw, "image/jpeg")!;
    expect(has(out, "Exif")).toBe(false);
    expect(has(out, "FakeCam")).toBe(false);
    expect(has(out, "secret comment")).toBe(false);
    expect([out[0], out[1], out.at(-2), out.at(-1)]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
    expect(out.length).toBeLessThan(raw.length);
  });

  it("removes text and EXIF chunks from a PNG", () => {
    const raw = load("text.png");
    expect(has(raw, "Someone Private")).toBe(true);
    const out = stripImageMetadata(raw, "image/png")!;
    expect(has(out, "Someone Private")).toBe(false);
    expect(has(out, "Somewhere")).toBe(false);
    expect(has(out, "FakeCam")).toBe(false);
    expect(has(out, "IEND")).toBe(true);
  });

  it("removes EXIF from a WebP and fixes its header", () => {
    const raw = load("exif.webp");
    expect(has(raw, "FakeCam")).toBe(true);
    const out = stripImageMetadata(raw, "image/webp")!;
    expect(has(out, "FakeCam")).toBe(false);
    const riff = out[4] | (out[5] << 8) | (out[6] << 16) | (out[7] << 24);
    expect(riff).toBe(out.length - 8);
  });

  // Hand-built files (no real photos) for the cases a phone camera can produce.
  const enc = (t: string) => new TextEncoder().encode(t);
  const cat = (...p: Uint8Array[]) => {
    const out = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
    let at = 0;
    for (const x of p) {
      out.set(x, at);
      at += x.length;
    }
    return out;
  };
  const seg = (marker: number, body: Uint8Array) => cat(new Uint8Array([0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body);
  const GPS = enc("Exif\0\0GPSLatitude=1.0N;GPSLongitude=4.0E");
  const SOI = new Uint8Array([0xff, 0xd8]);
  const EOI = new Uint8Array([0xff, 0xd9]);
  const SOS = cat(seg(0xda, new Uint8Array([1, 1, 0, 0, 0x3f, 0])), new Uint8Array([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56]));
  const JFIF = seg(0xe0, enc("JFIF\0\x01\x02"));

  it("drops a second picture appended after the end of a JPEG (motion and HDR photos)", () => {
    const second = cat(SOI, seg(0xe1, GPS), SOS, EOI);
    const out = stripImageMetadata(cat(SOI, JFIF, SOS, EOI, second), "image/jpeg")!;
    expect(has(out, "GPSLatitude")).toBe(false);
    expect([out.at(-2), out.at(-1)]).toEqual([0xff, 0xd9]);
    expect(has(out, "JFIF")).toBe(true);
  });

  it("drops Content Credentials (APP11) and segments between progressive scans", () => {
    const c2pa = stripImageMetadata(cat(SOI, seg(0xeb, enc("JP\0\0jumb c2pa GPSLatitude creator")), SOS, EOI), "image/jpeg")!;
    expect(has(c2pa, "GPSLatitude")).toBe(false);
    const prog = stripImageMetadata(cat(SOI, SOS, seg(0xfe, enc("comment between scans")), seg(0xe1, GPS), seg(0xc4, new Uint8Array([0, 1, 2])), SOS, EOI), "image/jpeg")!;
    expect(has(prog, "GPSLatitude")).toBe(false);
    expect(has(prog, "comment between scans")).toBe(false);
    // Both scans, with their escaped bytes and restart markers, are still there.
    expect(Buffer.from(prog).toString("hex").match(/12ff0034ffd056/g)).toHaveLength(2);
  });

  it("keeps the color profile but drops the multi-picture index", () => {
    const out = stripImageMetadata(cat(SOI, seg(0xe2, enc("ICC_PROFILE\0\x01\x01profile")), seg(0xe2, enc("MPF\0index")), SOS, EOI), "image/jpeg")!;
    expect(has(out, "ICC_PROFILE")).toBe(true);
    expect(has(out, "MPF")).toBe(false);
  });

  it("drops Content Credentials (caBX) and unknown chunks from a PNG", () => {
    const crc = new Uint8Array(4);
    const chunk = (type: string, data: Uint8Array) => cat(new Uint8Array([data.length >>> 24, (data.length >> 16) & 0xff, (data.length >> 8) & 0xff, data.length & 0xff]), enc(type), data, crc);
    const png = cat(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", new Uint8Array(13)),
      chunk("caBX", enc("c2pa GPSLatitude")),
      chunk("prVt", enc("private GPSLatitude")),
      chunk("IDAT", new Uint8Array(2)),
      chunk("IEND", new Uint8Array(0)),
      enc("trailing GPSLatitude"),
    );
    const out = stripImageMetadata(png, "image/png")!;
    expect(has(out, "GPSLatitude")).toBe(false);
    expect(has(out, "IDAT")).toBe(true);
  });

  it("refuses a WebP chunk with an impossible size instead of looping", () => {
    const le = (n: number) => new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]);
    const vp8 = cat(enc("VP8L"), le(4), new Uint8Array([0x2f, 0, 0, 0]));
    const bad = cat(enc("JUNK"), new Uint8Array([0xf8, 0xff, 0xff, 0xff]));
    const body = cat(enc("WEBP"), vp8, bad);
    const started = Date.now();
    expect(stripImageMetadata(cat(enc("RIFF"), le(body.length), body), "image/webp")).toBeNull();
    expect(Date.now() - started).toBeLessThan(100);
  });

  it("refuses files it cannot parse", () => {
    expect(stripImageMetadata(new Uint8Array([0xff, 0xd8, 0x00, 0x01, 0x02]), "image/jpeg")).toBeNull();
    expect(stripImageMetadata(new Uint8Array([1, 2, 3]), "image/png")).toBeNull();
  });
});
