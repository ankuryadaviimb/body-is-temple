/**
 * Removes metadata (EXIF location, device details, comments, XMP, IPTC, C2PA) from JPEG,
 * PNG and WebP files without touching the picture. The app's own photos are already
 * re-encoded on the phone; this protects every other way a file can arrive.
 *
 * Allowlists, not denylists: only the parts needed to show the picture (and its color
 * profile) are copied; everything else is dropped, including any data after the end of
 * the image (a second picture appended by "motion" or HDR photos keeps its own EXIF).
 * Returns null when the file cannot be parsed safely.
 */

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, Math.min(at + n, b.length)));

// ----------------------------------------------------------------------------------
// JPEG

/** Segments needed to decode: frame headers, tables, restart interval, number of lines. */
function jpegSegmentKept(marker: number, b: Uint8Array, start: number): boolean {
  if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc8) return true; // SOFn, DHT, DAC
  if (marker === 0xdb || marker === 0xdd || marker === 0xdc) return true; // DQT, DRI, DNL
  const id = (n: number) => ascii(b, start + 4, n);
  if (marker === 0xe0) return id(4) === "JFIF" || id(4) === "JFXX"; // APP0
  if (marker === 0xe2) return id(11) === "ICC_PROFILE"; // APP2 color profile (not MPF)
  if (marker === 0xee) return id(5) === "Adobe"; // APP14 color transform
  return false; // APP1 (EXIF, XMP), APP3 to APP13, APP11 (C2PA), APP15, COM and unknowns
}

function stripJpeg(b: Uint8Array): Uint8Array | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  let scans = 0;
  while (i + 1 < b.length) {
    if (b[i] !== 0xff) return null;
    let marker = b[i + 1];
    while (marker === 0xff && i + 2 < b.length) {
      i += 1;
      marker = b[i + 1];
    }
    if (marker === 0xd9) {
      // End of image: anything after it (another picture, a trailer) is dropped.
      parts.push(b.subarray(i, i + 2));
      return scans > 0 ? concat(parts) : null;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > b.length) return null;
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) return null;
    if (marker === 0xda) {
      // Start of scan: copy its header, then the coded data up to the next real marker.
      // Inside coded data, FF 00 is an escaped byte and FF D0 to D7 are restart markers.
      let j = i + 2 + len;
      while (j + 1 < b.length) {
        if (b[j] === 0xff && b[j + 1] !== 0x00 && !(b[j + 1] >= 0xd0 && b[j + 1] <= 0xd7) && b[j + 1] !== 0xff) break;
        j += 1;
      }
      if (j + 1 >= b.length) return null;
      parts.push(b.subarray(i, j));
      scans += 1;
      i = j;
      continue;
    }
    if (jpegSegmentKept(marker, b, i)) parts.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return null;
}

// ----------------------------------------------------------------------------------
// PNG

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// Chunks needed to show the picture: header, palette, data, transparency, color, animation.
const PNG_KEEP = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS", "cHRM", "gAMA", "iCCP", "sBIT", "sRGB", "cICP", "bKGD", "pHYs", "acTL", "fcTL", "fdAT"]);

function stripPng(b: Uint8Array): Uint8Array | null {
  if (b.length < 8 || PNG_SIG.some((v, k) => b[k] !== v)) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = view.getUint32(i, false);
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > b.length || end <= i) return null;
    if (PNG_KEEP.has(type)) parts.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") return concat(parts); // anything after IEND is dropped
  }
  return null;
}

// ----------------------------------------------------------------------------------
// WebP

const WEBP_KEEP = new Set(["VP8 ", "VP8L", "VP8X", "ALPH", "ANIM", "ANMF", "ICCP"]);

function stripWebp(b: Uint8Array): Uint8Array | null {
  if (b.length < 12 || ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  // Only the declared RIFF payload is read: trailing data is dropped.
  const riffEnd = Math.min(b.length, 8 + view.getUint32(4, true));
  const parts: Uint8Array[] = [];
  let i = 12;
  while (i + 8 <= riffEnd) {
    const type = ascii(b, i, 4);
    const size = view.getUint32(i + 4, true); // unsigned: a "negative" size can never loop
    const dataEnd = i + 8 + size;
    const end = dataEnd + (size & 1);
    if (dataEnd > riffEnd || end <= i) return null;
    if (WEBP_KEEP.has(type)) {
      const chunk = b.slice(i, Math.min(end, riffEnd));
      if (type === "VP8X" && chunk.length > 8) chunk[8] &= ~0x0c; // clear the EXIF and XMP flags
      parts.push(chunk);
    }
    i = end;
  }
  if (parts.length === 0) return null;
  const body = concat(parts);
  const out = new Uint8Array(12 + body.length);
  out.set(b.subarray(0, 12));
  out.set(body, 12);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  return out;
}

export function stripImageMetadata(bytes: Uint8Array, mime: string): Uint8Array | null {
  if (mime === "image/jpeg") return stripJpeg(bytes);
  if (mime === "image/png") return stripPng(bytes);
  if (mime === "image/webp") return stripWebp(bytes);
  return bytes;
}
