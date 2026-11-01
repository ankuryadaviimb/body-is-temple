import { it } from "vitest";
import { pdfCase, at, tableByColumn, COLS, HEADER } from "./harness";
import type { Item } from "./pdfx";

const SAFE: Item[] = [
  at(40, 800, "Patient Name :"), at(150, 800, "Mr. RAHUL SHARMA"), at(330, 800, "Lab No :"), at(400, 800, "26101200"),
  at(40, 784, "Ref. By :"), at(150, 784, "Dr. ANIL KAMATH"), at(330, 784, "Reported :"), at(400, 784, "12/10/2026 14:10"),
];
const RESULTS = tableByColumn(620, COLS, [
  ["Haemoglobin", "12.1", "g/dL", "13.0 - 17.0"],
  ["Total Leucocyte Count", "7200", "/cumm", "4000 - 11000"],
  ["Platelet Count", "2.5", "lakhs/cumm", "1.5 - 4.1"],
  ["Ferritin", "24", "ng/mL", "30 - 400"],
]);
const KEEP = [/Haemoglobin \| 12\.1 \| g\/dL \| 13\.0 - 17\.0/, /Ferritin \| 24 \| ng\/mL \| 30 - 400/];
const blood = (id: string, top: Item[], extra: Item[], secrets: string[], keep: (string | RegExp)[] = KEEP) =>
  pdfCase(id, "blood_report", [[...top, ...HEADER, ...RESULTS, ...extra]], secrets, keep);

it("R remaining categories", async () => {
  await blood("R1 header repeated as footer", [...SAFE], [
    at(40, 110, "SUNVITA WELLNESS", { size: 12 }),
    at(40, 96, "12, Lotus Residency, Wakad, Pune 411057 | Ph: 0253-2345678 | care@sunvita.in"),
    at(40, 82, "Lotus Residency, Wakad, Pune"),
  ], ["SUNVITA", "Lotus", "Wakad", "411057", "2345678", "care@"]);
  await blood("R2 Reported-by stamp on its own row inside the table", [...SAFE], [at(40, 556, "Reported by: PRIYA NAIR (Biochemist) 12/10/2026 14:10")], ["PRIYA", "NAIR"]);
  await blood("R2b Validated stamp (no 'by') beside the last result", [...SAFE], [at(460, 572, "Validated: P. NAIR")], ["NAIR"]);
  await blood("R3 barcode text, page number, printed by user", [...SAFE], [
    at(430, 820, "*2610120045*"), at(430, 812, "4512345"),
    at(40, 70, "Page 1 of 2"), at(250, 70, "Printed by: ramesh.k on 12/10/2026 14:32"),
  ], ["2610120045", "4512345", "ramesh"]);
  await blood("R4 ALL-CAPS name, no title, right above the table header", [...SAFE.slice(4), at(40, 660, "RAHUL SHARMA"), at(300, 660, "34Y / M")], [], ["RAHUL", "SHARMA", "34Y"]);
  await blood("R4b ALL-CAPS name on the header's baseline", [at(40, 800, "Reported :"), at(150, 800, "12/10/2026"), at(450, 643, "RAHUL SHARMA")], [], ["RAHUL", "SHARMA"]);
  await blood("R5 footer doctors: 'Dr' no period, credentials first", [...SAFE], [
    at(40, 120, "Dr Priya Nair"), at(300, 120, "MD Pathology Dr Rao"),
    at(40, 106, "DCP, DPB"), at(300, 106, "Consultant"),
  ], ["Priya", "Nair", "Rao"]);
  await blood("R6 names that are English words", [
    at(40, 800, "Patient Name :"), at(150, 800, "Ms. JOY HOPE"), at(330, 800, "Reported :"), at(400, 800, "12/10/2026"),
  ], [at(40, 540, "Note: Hope you get well soon, Joy")], ["JOY", "HOPE"]);
  await blood("R7 mobile with en dash in a strong row", [...SAFE], [at(40, 90, "Home blood collection: 98450\x9612345")], ["98450", "12345"]);
  await blood("R7c landline 3+4-4 in a strong row", [...SAFE], [at(40, 90, "Home blood collection: 020 4123-4567")], ["4123"]);
  await blood("R7b toll-free 1800 + 7 digits in a strong row", [...SAFE], [at(40, 90, "Home blood collection: 1800-1234567")], ["1234567"]);
  await pdfCase("R8 Urdu-labelled patient line with a unit (D2 analog)", "blood_report", [[
    at(40, 800, "نام : راحل شرما | عمر : 34", { indic: true }), at(300, 800, "Wt: 70 kg"),
    at(40, 760, "Haemoglobin 12.1 g/dL 13.0 - 17.0"),
  ]], ["راحل", "لحار", "شرما", "امرش"], ["Haemoglobin 12.1 g/dL 13.0 - 17.0"]);
  await blood("R9b Cyrillic a in 'Patient ID' on a strong row", [...SAFE], [at(40, 540, "Pаtient ID: 4512345 | Glucose 102 mg/dL", { indic: true })], ["4512345"]);
});
