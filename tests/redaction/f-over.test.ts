import { it } from "vitest";
import { pdfCase, at, tableByRow, COLS, HEADER } from "./harness";
import type { Item } from "./pdfx";

const PATIENT: Item[] = [at(40, 800, "Patient Name :"), at(150, 800, "Mr. RAHUL SHARMA"), at(330, 800, "Reported On :"), at(400, 800, "12/10/2026")];
const S = ["RAHUL", "SHARMA"];

it("F over-redaction", async () => {
  await pdfCase("F1 urine table with label colons", "blood_report", [[...PATIENT, ...HEADER,
    at(40, 620, "URINE ROUTINE"),
    at(40, 604, "pH :"), at(235, 604, "6.0"), at(385, 604, "4.6 - 8.0"),
    at(40, 588, "Specific Gravity :"), at(235, 588, "1.015"),
  ]], S, ["pH : | 6.0 | 4.6 - 8.0"]);
  await pdfCase("F2 inline Ref: range", "blood_report", [[...PATIENT,
    at(40, 700, "Hemoglobin 12.1 g/dL (Ref: 13.0-17.0)"),
    at(40, 684, "Vitamin D 18.5 ng/mL Ref.: 30-100"),
  ]], S, ["Hemoglobin 12.1 g/dL", "Vitamin D 18.5 ng/mL"]);
  await pdfCase("F3 values glued to units in consultation investigations", "consultation", [[
    at(40, 800, "Investigations : FBS 126mg/dL, TLC 7200/cumm, B12 180pg/mL, HbA1c 6.8%"),
    at(40, 784, "Plan : Plt 250000/uL, S.Cr: 0.9 mg/dL, TSH 5.6"),
  ]], [], ["126mg/dL", "7200/cumm", "180pg/mL", "250000/uL", "S.Cr: 0.9"]);
  await pdfCase("F4 'Test Name :' panel labels harvest test words", "blood_report", [[...PATIENT, ...HEADER,
    at(40, 620, "Test Name : COMPLETE BLOOD COUNT"),
    ...tableByRow(604, COLS, [["Haemoglobin", "13.5", "g/dL", "13.0 - 17.0"], ["Fasting Blood Sugar", "102", "mg/dL", "70 - 100"]]),
    at(40, 560, "Test Name : URINE ROUTINE"),
    ...tableByRow(544, COLS, [["Urine Glucose", "Nil"], ["Urine Protein", "Trace"]]),
    at(40, 500, "Package Name : Vitamin Profile"),
    ...tableByRow(484, COLS, [["Vitamin D (25-OH)", "18.5", "ng/mL", "30 - 100"], ["Vitamin B12", "180", "pg/mL", "211 - 911"]]),
  ]], S, ["Fasting Blood Sugar | 102", "Urine Glucose | Nil", "Urine Protein | Trace", "Vitamin D (25-OH) | 18.5", "Vitamin B12 | 180"]);
  // Page 2 continues the table with no column header and ends with a common disclaimer.
  await pdfCase("F5 continuation page without header + 'Test results' footnote", "blood_report", [
    [...PATIENT, ...HEADER, ...tableByRow(620, COLS, [["Haemoglobin", "13.5", "g/dL", "13.0 - 17.0"]])],
    [...tableByRow(780, COLS, [["Vitamin D (25-OH)", "18.5", "ng/mL", "30 - 100"], ["TSH", "2.1", "µIU/mL", "0.4 - 4.2"], ["Ferritin", "18", "ng/mL", "30 - 400"]]),
      at(40, 120, "*** End of Report ***"),
      at(40, 100, "Test results relate only to the sample received and should be correlated clinically"),
    ],
  ], S, ["Vitamin D (25-OH) | 18.5", "TSH | 2.1", "Ferritin | 18"]);
  await pdfCase("F5b first panel lacks a matching header, second has one", "blood_report", [[...PATIENT,
    at(40, 700, "GLYCOSYLATED HAEMOGLOBIN"),
    ...tableByRow(684, COLS, [["HbA1c", "5.9", "%", "< 5.7"], ["Estimated Average Glucose", "123", "mg/dL"]]),
    at(40, 640, "Investigation"), at(235, 640, "Observed Value"), at(305, 640, "Unit"), at(385, 640, "Biological Ref. Interval"),
    ...tableByRow(620, COLS, [["TSH", "2.1", "µIU/mL", "0.4 - 4.2"]]),
  ]], S, ["HbA1c | 5.9 | % | < 5.7", "TSH | 2.1"]);
  await pdfCase("F6 scan impression with s/o", "scan", [[
    at(40, 800, "IMPRESSION :"),
    at(40, 784, "Hepatomegaly with grade I fatty liver."),
    at(40, 768, "Findings s/o chronic cholecystitis."),
    at(40, 752, "Bowel loops distended, ? s/o subacute obstruction."),
  ]], [], ["s/o chronic cholecystitis", "s/o subacute obstruction"]);
  await pdfCase("F6b diagnosis with k/c/o and w/o", "consultation", [[
    at(40, 800, "Diagnosis : K/C/O hypothyroidism, on Thyronorm 50 mcg"),
    at(40, 784, "Advice : Tab. Thyronorm 50 mcg OD w/o food"),
  ]], [], ["hypothyroidism", "w/o food"]);
  await pdfCase("F7 'patient' in clinical text", "consultation", [[
    at(40, 800, "Impression : Patient has dyssynergic defecation (type 1)"),
    at(40, 784, "Advice : Patient advised to drink 3 L water daily"),
    at(40, 768, "Follow up in clinic after 2 weeks with reports"),
    at(40, 752, "Avoid using mobile phone in the toilet"),
    at(40, 736, "Repeat USG; previous report normal"),
    at(40, 720, "Visit not required if symptoms settle"),
    at(40, 704, "Pelvic floor 10 reps x 3 sets daily"),
  ]], [], ["dyssynergic defecation", "3 L water", "Follow up in clinic", "mobile phone", "previous report normal", "Visit not required", "Pelvic floor 10 reps"]);
  await pdfCase("F8 wrapped test name, value centered vertically", "blood_report", [[...PATIENT, ...HEADER,
    at(40, 620, "Glycosylated Haemoglobin"), at(40, 609, "(HbA1c), Whole Blood"), at(235, 614.5, "5.9"), at(305, 614.5, "%"), at(385, 614.5, "4.0 - 5.6"),
    at(40, 590, "Estimated Glomerular"), at(40, 579, "Filtration Rate"), at(235, 584.5, "98"), at(305, 584.5, "mL/min/1.73m2"), at(385, 584.5, "> 90"),
  ]], S, [/HbA1c.*5\.9|5\.9.*HbA1c/, /Filtration.*98|Glomerular.*98/]);
  await pdfCase("F9 abbreviated section headings", "consultation", [[
    at(40, 800, "Dx: Pelvic floor dyssynergia"),
    at(40, 784, "Imp: Dyssynergic defecation type 1"),
    at(40, 768, "Adv: Biofeedback x 8 sessions"),
    at(40, 752, "F/U: 4 weeks"),
  ]], [], ["Pelvic floor dyssynergia", "Biofeedback x 8 sessions"]);
  await pdfCase("F10 Indian brand names with strengths", "prescription", [[
    at(40, 800, "Rx"),
    at(40, 784, "1. Tab. Dolo-650 1-0-1 x 3 days"),
    at(40, 768, "2. Tab. Augmentin-625 BD x 5 days"),
    at(40, 752, "3. Tab. Rifagut-550 BD"),
    at(40, 736, "4. Tab. Ecosprin-150 OD after lunch"),
    at(40, 720, "5. Tab. Thyronorm-100 mcg OD empty stomach"),
  ]], [], ["Dolo-650", "Augmentin-625", "Rifagut-550", "Ecosprin-150", "Thyronorm-100"]);
  await pdfCase("F11 MR defecography title and findings", "scan", [[
    at(40, 800, "MR DEFECOGRAPHY"),
    at(40, 784, "FINDINGS :"),
    at(40, 768, "MR Defecography shows paradoxical puborectalis contraction"),
    at(40, 752, "Anorectal angle 92 degrees at rest"),
  ]], [], ["MR DEFECOGRAPHY", "paradoxical puborectalis contraction", "Anorectal angle 92"]);
  await pdfCase("F12 gender-split and lipid range lines", "blood_report", [[...PATIENT, ...HEADER,
    ...tableByRow(620, COLS, [["Haemoglobin", "12.1", "g/dL", "M: 13.0 - 17.0, F: 12.0 - 15.5"], ["Haemoglobin", "12.1", "g/dL", "13.0-17.0 M / 12.0-15.5 F"], ["Ferritin", "24", "ng/mL", "30 - 400 M, 13 - 150 F"]]),
  ]], S, ["M: 13.0 - 17.0, F: 12.0 - 15.5", "13.0-17.0 M / 12.0-15.5 F", "30 - 400 M, 13 - 150 F"]);
});
