import { describe, expect, it } from "vitest";
import { redactForAi, redactPages } from "@/lib/domain/redact";
import { pdfRows } from "@/lib/server/pdf-text";
import { buildPdf } from "../fixtures/pdf";

/**
 * What leaves for the AI, end to end: a made-up PDF is read exactly as on the server
 * (positions rebuilt into rows), then redacted. No real person, lab or place.
 */

const SECRETS = ["RAHUL", "SHARMA", "Rahul", "Sharma", "34 Years", "Flat 301", "Green", "Lakeside", "Aundh", "Pune", "411007", "Priya", "Nair", "PRIYA", "NAIR"];
const leaks = (text: string) => SECRETS.filter((s) => text.includes(s));

describe("PDF reports", () => {
  it("keeps names and addresses out even when the header is drawn column by column", async () => {
    const pdf = buildPdf([
      [
        [40, 800, "Patient Name :"],
        [40, 786, "Age / Gender :"],
        [40, 772, "Ref. By :"],
        [40, 758, "Address :"],
        [160, 800, "Mr.RAHUL SHARMA"],
        [160, 786, "34 Years / Male"],
        [160, 772, "Self"],
        [160, 758, "Flat 301, Green Lakeside, Aundh, Pune 411007"],
        [40, 720, "Hemoglobin 12.1 g/dL 13.0 - 17.0 L"],
        [40, 706, "Vitamin B12 180 pg/mL 211 - 911 L"],
        [40, 660, "Dr.Priya Nair"],
        [40, 646, "MD (Pathology)"],
      ],
    ]);
    const { pages } = await pdfRows(pdf);
    const r = redactPages(pages, "blood_report");
    expect(leaks(r.text)).toEqual([]);
    expect(r.text).toContain("Hemoglobin 12.1 g/dL 13.0 - 17.0 L");
    expect(r.text).toContain("Vitamin B12 180 pg/mL 211 - 911 L");
  });

  it("rebuilds a results table drawn column by column, and cuts the patient block above it", async () => {
    const col = (x: number, values: string[]) => values.map((v, i) => [x, 700 - i * 16, v] as [number, number, string]);
    const pdf = buildPdf([
      [
        [40, 800, "Sunrise Diagnostics"],
        [40, 786, "RAHUL SHARMA"],
        [300, 786, "34Y/M"],
        [40, 740, "Test"],
        [220, 740, "Result"],
        [300, 740, "Unit"],
        [400, 740, "Reference Range"],
        ...col(40, ["Haemoglobin", "Total Leucocyte Count", "Platelet Count", "Ferritin"]),
        ...col(220, ["12.1", "7200", "250000", "24"]),
        ...col(300, ["g/dL", "/cumm", "/cumm", "ng/mL"]),
        ...col(400, ["13.0 - 17.0", "4000 - 11000", "150000 - 410000", "30 - 400"]),
      ],
    ]);
    const { pages } = await pdfRows(pdf);
    const r = redactPages(pages, "blood_report");
    expect(leaks(r.text)).toEqual([]);
    expect(r.text).not.toContain("Sunrise");
    expect(r.text).toMatch(/Haemoglobin \| 12\.1 \| g\/dL \| 13\.0 - 17\.0/);
    expect(r.text).toMatch(/Platelet Count \| 250000 \| \/cumm \| 150000 - 410000/);
    expect(r.text).toMatch(/Ferritin \| 24 \| ng\/mL \| 30 - 400/);
  });

  it("reads at most 40 pages of a long file", async () => {
    const pages = Array.from({ length: 45 }, (_, i) => [[40, 700, `Hemoglobin ${10 + (i % 5)} g/dL`]] as [number, number, string][]);
    const read = await pdfRows(buildPdf(pages));
    expect(read.totalPages).toBe(45);
    expect(read.pages).toHaveLength(40);
    expect(read.truncated).toBe(true);
  });
});

describe("single lines that must never reach the AI", () => {
  const lines = [
    "Smt. ANITA DEVI",
    "Shri Ramesh Gowda",
    "PatientName: RAHUL SHARMA",
    "34Y/M",
    "Age (Yrs) : 34",
    "4th Cross, Aundh",
    "Ref Dr: Mehta",
    "Referral: Dr.Mehta",
    "Verified by: Priya Nair",
    "PRIYA NAIR",
    "OP No : 456789",
    "SID : 12345678",
    "Customer Care: (020) 4567 8910",
    "Contact: 98450.12345",
    "रोगी का नाम : राहुल शर्मा",
    "Sunrise Diagnostics Pvt Ltd",
    "12 Example Road, Sample City 411001",
    "Mob 98765 43210",
    "reports@example-lab.test",
  ];
  for (const line of lines) {
    it(line, () => {
      const r = redactForAi(`${line}\nHemoglobin 12.1 g/dL 13.0 - 17.0`);
      expect(r.text).toBe("Hemoglobin 12.1 g/dL 13.0 - 17.0");
    });
  }

  it("removes a name found in one line from every other line", () => {
    const r = redactForAi("Name: Kavya Iyer\nHemoglobin 12.1 g/dL 13.0 - 17.0 (Kavya: repeat in 3 months)");
    expect(r.text).not.toContain("Kavya");
    expect(r.text).toContain("Hemoglobin 12.1 g/dL 13.0 - 17.0");
  });

  it("keeps result values that look like numbers of other kinds", () => {
    const r = redactForAi("Platelet Count 250000 /cumm 150000 - 410000\n1,25-Dihydroxy Vitamin D 40 pg/mL 20 - 79\nTSH 2.1 uIU/mL 0.4 - 4.2\nUrine Glucose Nil");
    expect(r.text.split("\n")).toEqual([
      "Platelet Count 250000 /cumm 150000 - 410000",
      "1,25-Dihydroxy Vitamin D 40 pg/mL 20 - 79",
      "TSH 2.1 uIU/mL 0.4 - 4.2",
      "Urine Glucose Nil",
    ]);
  });
});

describe("consultations and prescriptions", () => {
  const visit = [
    "City Gut Clinic, 2nd Floor, 80 Feet Road, Baner 411045",
    "Patient: Arjun Mehta  Age: 41  Sex: M",
    "Chief complaints: Arjun, 41M, c/o constipation x 6 months",
    "History: straining, incomplete evacuation",
    "Diagnosis: Pelvic floor dyssynergia",
    "Advice: Biofeedback therapy, 8 sessions",
    "Psyllium 1 tsp at night with water",
    "Dr. Neha Rao, MD (Gastroenterology)",
    "Ph: 020 4123 4567",
  ].join("\n");

  it("sends only the clinical sections of a consultation", () => {
    const r = redactForAi(visit, "consultation");
    expect(r.text).toContain("Diagnosis: Pelvic floor dyssynergia");
    expect(r.text).toContain("Advice: Biofeedback therapy, 8 sessions");
    expect(r.text).toContain("Psyllium 1 tsp at night with water");
    for (const secret of ["Arjun", "Mehta", "41", "Baner", "411045", "Neha", "Rao", "4123", "Clinic", "constipation x 6"]) expect(r.text).not.toContain(secret);
  });

  it("sends medicine lines of a prescription", () => {
    const r = redactForAi("Patient: Arjun Mehta\nRx\nTab. Pantoprazole 40 mg OD before breakfast\nSyp. Lactulose 15 ml HS\nDr. Neha Rao", "prescription");
    expect(r.text).toContain("Tab. Pantoprazole 40 mg OD before breakfast");
    expect(r.text).toContain("Syp. Lactulose 15 ml HS");
    expect(r.text).not.toMatch(/Arjun|Mehta|Neha|Rao/);
  });
});
