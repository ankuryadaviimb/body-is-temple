import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractJsonObject } from "@/lib/ai/json";
import { endpointFor, extraBody, MODELS, type ProviderId } from "@/lib/ai/providers-config";
import { RECORD_SYSTEM_PROMPT, recordUserPrompt } from "@/lib/ai/records-prompt";
import { normalizeExtraction, redactForAi, redactPages } from "@/lib/domain/records";
import { pdfRows } from "@/lib/server/pdf-text";
import { buildPdf } from "../fixtures/pdf";

/**
 * Live check of lab report reading with made-up report text (no real person):
 *   RUN_AI_SMOKE=1 npx vitest run tests/smoke/records-providers.test.ts
 */

const enabled = process.env.RUN_AI_SMOKE === "1";
if (enabled && existsSync(".env.local")) process.loadEnvFile(".env.local");

const REPORT = `Sunrise Diagnostics Pvt Ltd
Patient Name : MR. RAVI KUMAR Age/Sex : 38 Y / Male
Ref. By : Dr. A Sharma Sample ID : AB12CD34EF
Collected On : 12/04/2026 08:10 AM Reported On : 12/04/2026 06:40 PM
COMPLETE BLOOD COUNT
Test Result Unit Reference
Hemoglobin 12.1 g/dL 13.0 - 17.0 L
Total Leucocyte Count 6.2 10^3/uL 4.0 - 10.0
Vitamin B12 180 pg/mL 211 - 911 L
25-OH Vitamin D 18.4 ng/mL 30 - 100 L
Ferritin 22 ng/mL 30 - 400 L
TSH 2.4 uIU/mL 0.4 - 4.2
Dr. P Rao, MD (Pathology)`;

async function read(provider: ProviderId, redacted: string) {
  const key = provider === "cloudflare" ? process.env.CLOUDFLARE_AI_TOKEN : process.env.GROQ_API_KEY;
  const started = Date.now();
  const res = await fetch(endpointFor(provider, process.env.CLOUDFLARE_ACCOUNT_ID), {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      ...extraBody(provider, "text"),
      model: MODELS[provider].text,
      messages: [
        { role: "system", content: RECORD_SYSTEM_PROMPT },
        { role: "user", content: recordUserPrompt("Blood report", redacted) },
      ],
      max_tokens: 3000,
      temperature: 0,
      ...(provider === "groq" ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const e = normalizeExtraction(extractJsonObject(body.choices?.[0]?.message?.content ?? ""));
  process.stderr.write(`${provider} ${res.status} ${Date.now() - started} ms ${JSON.stringify(e?.markers.map((m) => [m.name, m.value, m.flag]))} date=${e?.doc_date} summary=${JSON.stringify(e?.summary)}\n`);
  return { status: res.status, e };
}

// The same made-up report as a PDF whose table is drawn column by column (as some lab software does).
const col = (x: number, values: string[]) => values.map((v, i) => [x, 680 - i * 16, v] as [number, number, string]);
const PDF = buildPdf([
  [
    [40, 800, "Sunrise Diagnostics Pvt Ltd"],
    [40, 780, "Patient Name :"],
    [40, 766, "Age/Sex :"],
    [160, 780, "MR. RAVI KUMAR"],
    [160, 766, "38 Y / Male"],
    [40, 750, "Reported On : 12/04/2026 06:40 PM"],
    [40, 720, "COMPLETE BLOOD COUNT"],
    [40, 700, "Test"],
    [220, 700, "Result"],
    [300, 700, "Unit"],
    [400, 700, "Reference"],
    ...col(40, ["Hemoglobin", "Vitamin B12", "Ferritin", "TSH"]),
    ...col(220, ["12.1 L", "180 L", "22 L", "2.4"]),
    ...col(300, ["g/dL", "pg/mL", "ng/mL", "uIU/mL"]),
    ...col(400, ["13.0 - 17.0", "211 - 911", "30 - 400", "0.4 - 4.2"]),
    [40, 560, "Dr. P Rao, MD (Pathology)"],
  ],
]);

describe.skipIf(!enabled)("lab report reading (live)", () => {
  const inputs: [string, () => Promise<string>][] = [
    ["text", async () => redactForAi(REPORT).text],
    ["PDF drawn by columns", async () => redactPages((await pdfRows(PDF)).pages, "blood_report").text],
  ];
  for (const [label, input] of inputs) {
    for (const provider of ["cloudflare", "groq"] as ProviderId[]) {
      it(`${provider}, ${label}: reads values, flags and the date`, async () => {
        const redacted = await input();
        expect(redacted).not.toMatch(/RAVI|KUMAR|Sharma|Rao|Sunrise|38 Y/i);
        const { status, e } = await read(provider, redacted);
        expect(status).toBe(200);
        expect(e).not.toBeNull();
        const b12 = e!.markers.find((m) => m.name === "Vitamin B12");
        expect(b12?.value).toBe(180);
        expect(b12?.flag).toBe("low");
        expect(e!.markers.find((m) => m.name === "TSH")?.flag).toBe("normal");
        expect(e!.markers.find((m) => m.name === "Ferritin")?.value).toBe(22);
        expect(e!.doc_date).toBe("2026-04-12");
      }, 90_000);
    }
  }
});
