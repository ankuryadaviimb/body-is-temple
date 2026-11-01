import { it } from "vitest";
import { pdfCase, at, tableByColumn, tableByRow, COLS, HEADER, type Kind } from "./harness";
import type { Item } from "./pdfx";

const PATIENT: Item[] = [
  at(40, 800, "Patient Name :"), at(150, 800, "Mr. RAHUL SHARMA"), at(330, 800, "Lab No :"), at(400, 800, "BLR2610120045"),
  at(40, 784, "Age / Sex :"), at(150, 784, "34 Y 2 M / Male"), at(330, 784, "Collected :"), at(400, 784, "12/10/2026 08:30"),
  at(40, 768, "Ref. By :"), at(150, 768, "Dr. ANIL KAMATH"), at(330, 768, "Reported :"), at(400, 768, "12/10/2026 14:10"),
];
const RESULTS = tableByColumn(620, COLS, [
  ["Haemoglobin", "12.1", "g/dL", "13.0 - 17.0"],
  ["Total Leucocyte Count", "7200", "/cumm", "4000 - 11000"],
  ["Platelet Count", "2.5", "lakhs/cumm", "1.5 - 4.1"],
  ["Ferritin", "24", "ng/mL", "30 - 400"],
]);
const SECRETS = ["RAHUL", "SHARMA", "ANIL", "KAMATH", "BLR2610120045", "34 Y"];
const KEEP = [/Haemoglobin \| 12\.1 \| g\/dL \| 13\.0 - 17\.0/, /Ferritin \| 24 \| ng\/mL \| 30 - 400/];
const blood = (id: string, extra: Item[], secrets: string[], keep: (string | RegExp)[] = KEEP, note?: string, kind: Kind = "blood_report") =>
  pdfCase(id, kind, [[...PATIENT, ...HEADER, ...RESULTS, ...extra]], [...SECRETS, ...secrets], keep, note);

it("A blood report leaks", async () => {
  await blood("A0 baseline lab report", [], []);
  await blood("A1 footer address with 2nd Fl + PIN", [at(40, 90, "Sunrise Path Labs, 2nd Fl, Orchid Towers, 14 Paud Main Rd, Pune 411045")], ["Sunrise", "Orchid", "Paud", "Pune", "411045"]);
  await blood("A1b footer: Gr Fl, 80 Ft Rd., Baner", [at(40, 90, "Sunrise Path Labs | No. 12, Gr. Fl., 80 Ft Rd., Baner, Pune 411045")], ["Sunrise", "Baner", "411045"]);
  await blood("A1c footer address without unit words", [at(40, 90, "Sunrise Path Labs, No. 12, 80 Ft Rd., Baner, Pune 411045")], ["Sunrise", "Baner", "411045"]);
  await blood("A2 footer NCR: Sec 62 Noida", [at(40, 90, "Sunrise Labs, B-23, Sec 62, Noida 201301")], ["Sunrise", "Noida", "201301"]);
  await blood("A2b footer NCR: Sec-14 Gurugram, no PIN", [at(40, 90, "Sunrise Labs, SCO 12, Sec-14, Gurugram")], ["Sunrise", "Gurugram"]);
  await blood("A3 DOB beside Collected On", [
    at(40, 752, "DOB :"), at(150, 752, "15/08/1990"),
  ], ["15/08/1990"], KEEP, "DOB row sits under Ref By; Collected row above has the real date");
  // The more common hospital layout: DOB on the same row as the collection date, DOB first.
  await pdfCase("A3b DOB and Collected on the same row (DOB left)", "blood_report", [[
    at(40, 800, "Patient Name :"), at(150, 800, "Mr. RAHUL SHARMA"), at(330, 800, "UHID :"), at(400, 800, "MH0045123"),
    at(40, 784, "DOB :"), at(150, 784, "15/08/1990"), at(330, 784, "Collected On :"), at(400, 784, "12/10/2026 08:30"),
    ...HEADER, ...RESULTS,
  ]], [...SECRETS, "15/08/1990", "MH0045123"], KEEP);
  await pdfCase("A4 Date of Birth row above the report date", "blood_report", [[
    at(40, 800, "Patient Name :"), at(150, 800, "Mr. RAHUL SHARMA"),
    at(40, 784, "Date of Birth :"), at(150, 784, "15-Aug-1990"),
    at(40, 768, "Report Date :"), at(150, 768, "12-Oct-2026"),
    ...HEADER, ...RESULTS,
  ]], [...SECRETS, "15-Aug-1990"], KEEP);
  await blood("A5 rotated side strip (left margin) at a result row's height", [
    at(22, 604, "Sunrise Path Labs, Baner, Pune 411045", { rot: 90, size: 7 }),
  ], ["Sunrise", "Baner", "411045"]);
  await blood("A5b rotated side strip (right margin)", [
    at(570, 588, "Sunrise Path Labs, Baner, Pune 411045", { rot: 90, size: 7 }),
  ], ["Sunrise", "Baner", "411045"]);
  await blood("A6 diagonal watermark with a keyword lab name", [
    at(150, 604, "SUNRISE DIAGNOSTICS", { rot: 35, size: 40 }),
  ], ["SUNRISE"], [...KEEP, /Total Leucocyte Count \| 7200/], "watermark origin at TLC row height");
  await blood("A6b diagonal watermark without a keyword", [
    at(150, 604, "SUNRISE PATH LABS", { rot: 35, size: 40 }),
  ], ["SUNRISE"], [...KEEP, /Total Leucocyte Count \| 7200/]);
  await blood("A7 outsourced-test note", [
    at(40, 540, "Note: Vitamin D3 and Vitamin B12 outsourced to Sunrise Reference Lab, Andheri (E), Mumbai"),
    at(40, 524, "HbA1c by HPLC (Bio-Rad D-10) processed at Sunrise Path Labs, Aundh"),
  ], ["Sunrise", "Andheri", "Mumbai", "Aundh"]);
  await blood("A8 critical value call-out naming staff", [
    at(40, 540, "Potassium 6.8 mmol/L - Critical value informed to Sr. Kavya (ICU) at 10:30 hrs"),
  ], ["Kavya"]);
  await blood("A10 untitled pathologist signature on the last result row", [
    at(430, 572, "PRIYA NAIR"), at(430, 558, "MD (Pathology)"),
  ], ["PRIYA", "NAIR"]);
  await blood("A10b two signatures row", [
    at(40, 120, "Priya Nair"), at(300, 120, "Arjun Rao"),
    at(40, 106, "Consultant Pathologist"), at(300, 106, "Consultant Biochemist"),
  ], ["Priya", "Nair", "Arjun", "Rao"]);
  await blood("A11 QR / verify text and website in footer", [
    at(40, 100, "Scan QR to verify: https://verify.sunriselabs.in/r/BLR2610120045"),
    at(40, 86, "Page 1 of 1 | 24x7 Home Collection 1860 500 1234 | sunriselabs.care"),
  ], ["sunrise", "1860 500 1234"]);
});

it("A9 repeated patient header on page 2, no table header there", async () => {
  const p2: Item[] = [
    at(40, 800, "P a t i e n t  N a m e :"), at(170, 800, "Mr. RAHUL SHARMA"), at(330, 800, "Age/Sex :"), at(400, 800, "34 Y 2 M / M"),
    at(40, 784, "Location :"), at(150, 784, "Baner Branch"), at(330, 784, "Client :"), at(400, 784, "Sunrise Corporate"),
    ...tableByRow(740, COLS, [
      ["LIPID PROFILE", "", "", ""],
      ["Total Cholesterol", "212", "mg/dL", "< 200"],
      ["HDL Cholesterol", "42", "mg/dL", "> 40"],
    ]),
  ];
  await pdfCase("A9 page 2 header repeated without table header", "blood_report", [[...PATIENT, ...HEADER, ...RESULTS], p2], [...SECRETS, "Baner", "Sunrise"], [/Total Cholesterol \| 212/]);
});
