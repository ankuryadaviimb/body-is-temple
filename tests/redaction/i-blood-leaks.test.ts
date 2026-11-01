import { it } from "vitest";
import { pdfCase, at, tableByColumn, tableByRow, COLS, HEADER } from "./harness";
import type { Item } from "./pdfx";

// A safe, labelled patient block (name harvested via "Mr.").
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

it("P leaks", async () => {
  // P1: modern "card" header: small labels above bold values.
  await blood("P1 stacked card: labels above values, Sample Type = Whole Blood", [
    at(40, 800, "PATIENT NAME", { size: 7 }), at(190, 800, "AGE / SEX", { size: 7 }), at(280, 800, "SAMPLE TYPE", { size: 7 }), at(420, 800, "REFERRED BY", { size: 7 }),
    at(40, 788, "RAHUL SHARMA"), at(190, 788, "34 Y / M"), at(280, 788, "Whole Blood EDTA"), at(420, 788, "ANIL KAMATH"),
  ], [], ["RAHUL", "SHARMA", "34 Y", "ANIL", "KAMATH"]);
  await blood("P1b stacked card without age", [
    at(40, 800, "PATIENT NAME", { size: 7 }), at(240, 800, "SAMPLE TYPE", { size: 7 }), at(400, 800, "REF. DOCTOR", { size: 7 }),
    at(40, 788, "RAHUL SHARMA"), at(240, 788, "Whole Blood"), at(400, 788, "ANIL KAMATH"),
  ], [], ["RAHUL", "SHARMA", "ANIL", "KAMATH"]);
  // P2: two-column block, colon in its own column, Sample Type on the Age row.
  await blood("P2 two-column block: Age row shares a line with Sample Type", [
    at(40, 800, "Patient Name"), at(115, 800, ":"), at(125, 800, "Mr. RAHUL SHARMA"), at(330, 800, "Lab No"), at(395, 800, ":"), at(405, 800, "26101200"),
    at(40, 784, "Age / Sex"), at(115, 784, ":"), at(125, 784, "34 Y / M"), at(330, 784, "Sample Type"), at(395, 784, ":"), at(405, 784, "Whole Blood"),
    at(40, 768, "Ref. By"), at(115, 768, ":"), at(125, 768, "Dr. ANIL KAMATH"), at(330, 768, "Collected"), at(395, 768, ":"), at(405, 768, "12/10/2026 08:30"),
  ], [], ["RAHUL", "SHARMA", "34 Y", "ANIL", "KAMATH", "26101200"]);
  // P3: letterhead on the left, patient block on the right, same bands.
  await blood("P3 letterhead left + patient block right", [
    at(40, 800, "SUNVITA WELLNESS", { size: 14 }), at(330, 800, "Name"), at(390, 800, ": Mr. RAHUL SHARMA"),
    at(40, 784, "12, Lotus Residency, Wakad"), at(330, 784, "Age / Sex"), at(390, 784, ": 34 Y / M"),
    at(40, 768, "Pune 411057"), at(330, 768, "Sample"), at(390, 768, ": Whole Blood"),
  ], [], ["SUNVITA", "Lotus", "Wakad", "Pune", "411057", "RAHUL", "SHARMA", "34 Y"]);
  await blood("P4 Collected At (place) + Specimen : EDTA Blood", [
    ...SAFE, at(40, 768, "Collected At :"), at(150, 768, "Home Visit - Kharadi"), at(330, 768, "Specimen :"), at(400, 768, "EDTA Blood"),
  ], [], ["Kharadi", "RAHUL", "ANIL"]);
  await blood("P5 Patient ID (7 digits) + Sample Type", [
    ...SAFE, at(40, 768, "Patient ID :"), at(150, 768, "4512345"), at(330, 768, "Sample Type :"), at(400, 768, "Whole Blood"),
  ], [], ["4512345"]);
  await blood("P6 Ref. By without Dr + Sample Type", [
    at(40, 800, "Patient Name :"), at(150, 800, "Mr. RAHUL SHARMA"), at(330, 800, "Lab No :"), at(400, 800, "26101200"),
    at(40, 784, "Ref. By :"), at(150, 784, "ANIL KAMATH"), at(330, 784, "Sample Type :"), at(400, 784, "Whole Blood"),
  ], [], ["ANIL", "KAMATH"]);
  await blood("P6b address continuation line + Sample Type", [
    ...SAFE, at(40, 768, "Address :"), at(150, 768, "B-12, Lotus Residency"), at(330, 768, "Barcode :"), at(400, 768, "4512345"),
    at(150, 752, "Hadapsar, Pune"), at(330, 752, "Sample Type :"), at(400, 752, "Whole Blood"),
  ], [], ["Hadapsar", "Pune", "Lotus", "4512345"]);
  await blood("P7 multi-line remark: place spills onto a line with a test word", [...SAFE], [
    at(40, 540, "Remarks: Tests marked * were processed at our"),
    at(40, 526, "Vashi reference laboratory. HbA1c by HPLC method."),
  ], ["Vashi"]);
  await blood("P8 note: sent to (lowercase) reference lab", [...SAFE], [
    at(40, 540, "Note: Vitamin D and Vitamin B12 samples were sent to our Thane reference lab."),
  ], ["Thane"]);
  await blood("P9 note: received from (lowercase) collection centre", [...SAFE], [
    at(40, 540, "Note: Sample received from Kharadi collection centre after 6 hrs; glucose may be falsely low."),
  ], ["Kharadi"]);
  await blood("P10 critical call-out: informed telephonically to", [...SAFE], [
    at(40, 540, "Potassium 6.8 mmol/L - critical value informed telephonically to Kavya Iyer at 10:30 hrs"),
  ], ["Kavya", "Iyer"]);
  await blood("P11 signature on a result row, right margin (column break)", [...SAFE], [
    at(460, 572, "PRIYA NAIR"), at(460, 558, "MD (Pathology)"),
  ], ["PRIYA", "NAIR"]);
  await blood("P12 horizontal watermark brand, centre", [...SAFE], [at(150, 604, "SUNVITA", { size: 40 })], ["SUNVITA"], [...KEEP, /Total Leucocyte Count \| 7200/]);
  await blood("P12b horizontal watermark brand, right", [...SAFE], [at(440, 604, "SUNVITA", { size: 30 })], ["SUNVITA"], [...KEEP, /Total Leucocyte Count \| 7200/]);
  await blood("P13 promo footer: keyword-less brand + test word", [...SAFE], [
    at(40, 90, "Book your next HbA1c test on the Sunvita app and get 20% off"),
  ], ["Sunvita"]);
  await blood("P14 footer: Blood Collection Centres (plural) + localities", [...SAFE], [
    at(40, 90, "Our Blood Collection Centres: Wakad, Hadapsar, Kharadi | Open 7 am - 9 pm"),
  ], ["Wakad", "Hadapsar", "Kharadi"]);
  await blood("P15 footer: tier-2 landline 4+7 in a strong row", [...SAFE], [
    at(40, 90, "Home blood collection: 0253-2345678 / 0253-2345679"),
  ], ["2345678", "2345679"]);
  await blood("P17 Age (no unit) + Specimen : Whole Blood", [
    ...SAFE, at(40, 768, "Age :"), at(150, 768, "34"), at(330, 768, "Specimen :"), at(400, 768, "Whole Blood"),
  ], [], ["Age : | 34", "| 34 |"]);
  await blood("P2b sample-type cell first, age second", [
    ...SAFE, at(40, 768, "Sample Type :"), at(150, 768, "Whole Blood"), at(330, 768, "Age / Sex :"), at(400, 768, "34 Y / M"),
  ], [], ["34 Y"]);
});

it("P1c stacked card repeated on a page with no table header", async () => {
  await pdfCase("P1c card on a header-less continuation page", "blood_report", [
    [...SAFE, ...HEADER, ...RESULTS],
    [at(40, 800, "PATIENT NAME", { size: 7 }), at(240, 800, "SAMPLE TYPE", { size: 7 }), at(400, 800, "REF. DOCTOR", { size: 7 }),
     at(40, 788, "PRIYA MENON"), at(240, 788, "Whole Blood"), at(400, 788, "ANIL KAMATH"),
     ...tableByRow(760, COLS, [["TSH", "2.1", "uIU/mL", "0.4 - 4.2"]])],
  ], ["PRIYA", "MENON", "ANIL", "KAMATH"], [/TSH \| 2\.1/]);
});

it("P16 continuation page: brand line directly above an S.No.-first row", async () => {
  const C5 = [40, 70, 235, 305, 385];
  await pdfCase("P16 continuation page: brand above S.No. weak row", "blood_report", [
    [...SAFE, ...HEADER, ...RESULTS],
    [at(40, 800, "SUNVITA WELLNESS, WAKAD"), ...tableByRow(780, C5, [["8", "NT-proBNP", "85", "pg/mL", "< 125"], ["9", "Lp(a)", "25", "mg/dL", "< 30"]])],
  ], ["SUNVITA", "WAKAD"], [/NT-proBNP \| 85/]);
});
