/**
 * Extended copy of tests/fixtures/pdf.ts: per-item font size, rotation, and an "indic" font
 * whose ToUnicode map turns single bytes into Devanagari/Tamil code points. Made-up data only.
 */
export type Item = [number, number, string] | { x: number; y: number; s: string; size?: number; rot?: number; indic?: boolean };

export function buildPdfX(pages: Item[][]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  // Collect indic characters across all pages: each gets a byte code from 0xA1 upward.
  const indicChars: string[] = [];
  const norm = (it: Item) => (Array.isArray(it) ? { x: it[0], y: it[1], s: it[2] } : it);
  for (const p of pages) for (const raw of p) {
    const it = norm(raw);
    if (it.indic) for (const ch of Array.from(it.s)) if (ch !== " " && !indicChars.includes(ch)) indicChars.push(ch);
  }
  const code = (ch: string) => (ch === " " ? 0x20 : 0xa1 + indicChars.indexOf(ch));
  const objs: string[] = ["<< /Type /Catalog /Pages 2 0 R >>", ""];
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"); // 3
  const bf = indicChars.map((ch) => {
    const hex = Array.from(ch).map((c) => c.codePointAt(0)!.toString(16).padStart(4, "0")).join("");
    return `<${code(ch).toString(16).padStart(2, "0")}> <${hex}>`;
  });
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n${bf.length + 1} beginbfchar\n<20> <0020>\n${bf.join("\n")}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
  objs.push(`<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`); // 4
  const widths = Array.from({ length: 256 }, () => 500).join(" ");
  objs.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /FirstChar 0 /LastChar 255 /Widths [${widths}] /ToUnicode 4 0 R >>`); // 5
  const kids: string[] = [];
  for (const page of pages) {
    const stream = page
      .map((raw) => {
        const it = norm(raw);
        const size = it.size ?? 10;
        const r = ((it.rot ?? 0) * Math.PI) / 180;
        const [a, b, c, d] = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r)].map((v) => +v.toFixed(4));
        const body = it.indic
          ? `<${Array.from(it.s).map((ch) => code(ch).toString(16).padStart(2, "0")).join("")}> Tj`
          : `(${esc(it.s)}) Tj`;
        return `BT /${it.indic ? "F2" : "F1"} ${size} Tf ${a} ${b} ${c} ${d} ${it.x} ${it.y} Tm ${body} ET`;
      })
      .join("\n");
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const contentId = objs.length;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 5 0 R >> >> /Contents ${contentId} 0 R >>`);
    kids.push(`${objs.length} 0 R`);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "latin1"));
}
