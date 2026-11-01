import { it } from "vitest";
import { pdfCase, at, tableByRow, COLS, HEADER } from "./harness";
import type { Item } from "./pdfx";

const PATIENT: Item[] = [at(40, 800, "Patient Name :"), at(150, 800, "Mr. RAHUL SHARMA"), at(330, 800, "Reported On :"), at(400, 800, "12/10/2026")];
const S = ["RAHUL", "SHARMA"];
const tbl = (id: string, rows: string[][], keep: (string | RegExp)[], extra: Item[] = [], top: Item[] = PATIENT) =>
  pdfCase(id, "blood_report", [[...top, ...HEADER, ...tableByRow(620, COLS, rows, 15), ...extra]], S, keep);
// LIS text-flow: one string per row, cells padded by 2-4 spaces (pdf.js keeps it one item).
const lis = (id: string, lines: string[], keep: (string | RegExp)[], top: Item[] = PATIENT) =>
  pdfCase(id, "blood_report", [[...top, ...HEADER, ...lines.map((l, i) => at(40, 620 - i * 15, l))]], S, keep);

it("Q over-redaction", async () => {
  await tbl("Q1 Widal titres", [["WIDAL TEST"], ["Salmonella Typhi O", "1:160", "", "< 1:80"], ["Salmonella Typhi H", "1:80", "", "< 1:160"], ["Salmonella Paratyphi AH", "1:40", "", "< 1:160"]],
    ["Salmonella Typhi O | 1:160", "Salmonella Typhi H | 1:80", "Paratyphi AH | 1:40"]);
  await tbl("Q2 urine culture + antibiogram", [["URINE CULTURE & SENSITIVITY"], ["Organism Isolated", "Escherichia coli"], ["Colony Count", "> 10^5 CFU/mL"], ["Amikacin", "S"], ["Ciprofloxacin", "R"], ["Nitrofurantoin", "Sensitive"], ["Meropenem", "<=0.25", "", "S"]],
    ["Escherichia coli", "10^5 CFU/mL", "Amikacin | S", "Ciprofloxacin | R", "Nitrofurantoin | Sensitive", "Meropenem"]);
  await tbl("Q2b culture: no growth", [["BLOOD CULTURE"], ["Result", "No growth after 5 days of incubation"]], ["No growth"]);
  await lis("Q3 coagulation, LIS rows (2-4 space padding)", ["Prothrombin Time  13.5 sec  11.0 - 14.0", "APTT  32 sec  26 - 40", "Bleeding Time  2 min 30 sec  1 - 5 min", "INR  1.10  0.80 - 1.20"],
    [/Prothrombin Time.*13\.5/, /APTT.*32/, /Bleeding Time.*2 min 30 sec/, /INR.*1\.10/]);
  await tbl("Q3b coagulation, label colons and min units", [["PT :", "13.5", "sec", "11.0 - 14.0"], ["Clotting Time", "5", "min", "4 - 9"], ["Bleeding Time", "2.5", "min", "1 - 5"]],
    [/PT.*13\.5/, /Clotting Time.*5/, /Bleeding Time.*2\.5/]);
  await lis("Q4 urine, LIS rows", ["pH  6.0  4.6 - 8.0", "Specific Gravity  1.015  1.005 - 1.030", "Pus Cell  2-3 /hpf  0 - 5", "Epithelial Cell  1-2 /hpf"],
    [/pH.*6\.0/, /Specific Gravity.*1\.015/, /Pus Cell.*2-3/, /Epithelial Cell.*1-2/]);
  await tbl("Q4b urine key : value, one item each", [["pH : 6.0"], ["Pus Cell : 2-3 /hpf"], ["Sickle Cell (Solubility) : Negative"]], [/pH : 6\.0/, /Pus Cell : 2-3/, /Sickle Cell.*Negative/]);
  await tbl("Q5 'Sr.' for serum", [["Sr. Creatinine", "0.9", "mg/dL", "0.7 - 1.3"], ["Sr. Uric Acid", "5.8", "mg/dL", "3.5 - 7.2"], ["Folic Acid", "8.2", "ng/mL", "> 5.38"], ["Total Proteins", "7.2", "g/dL", "6.4 - 8.3"], ["Sr. Total Proteins", "7.1", "g/dL", "6.4 - 8.3"]],
    // "Sr." here means serum: it is read as "Serum", so it is not taken for a title before a name.
    ["Serum Creatinine | 0.9", "Serum Uric Acid | 5.8", "Folic Acid | 8.2", "Total Proteins | 7.2"]);
  await tbl("Q6 'Ref. By : DIRECT' (walk-in) harvested as a name", [["Bilirubin - Total", "0.8", "mg/dL", "0.3 - 1.2"], ["Bilirubin - Direct", "0.2", "mg/dL", "< 0.3"], ["LDL Cholesterol (Direct)", "134", "mg/dL", "< 100"]],
    ["Bilirubin - Direct | 0.2", "LDL Cholesterol (Direct) | 134"], [], [...PATIENT, at(40, 784, "Ref. By : DIRECT")]);
  await tbl("Q7 multi-line interpretive ranges", [["Total Cholesterol", "212", "mg/dL", "Desirable: < 200"], ["", "", "", "Borderline: 200 - 239"], ["", "", "", "High: >= 240"], ["25-OH Vitamin D", "18.5", "ng/mL", "Deficient: < 20"], ["", "", "", "Insufficient: 20 - 30"], ["", "", "", "Sufficient: 30 - 100"]],
    ["Borderline: 200 - 239", "High: >= 240", "Insufficient: 20 - 30", "Sufficient: 30 - 100"]);
  await tbl("Q8 age-banded ranges", [["PSA, Total", "1.2", "ng/mL", "40-49 yrs: < 2.5"], ["Alkaline Phosphatase", "85", "U/L", "Adults (> 18 years): 40 - 129"]],
    ["40-49 yrs: < 2.5", "18 years"]);
  await tbl("Q9 unknown tests (weak rows) with sex/age/Ref ranges", [["Progesterone", "0.5", "ng/mL", "Male 0.2 - 1.4"], ["IGF-1", "180", "ng/mL", "Age 31-35: 115 - 307"], ["NT-proBNP", "85", "pg/mL", "Ref: < 125"], ["Calcitonin", "4.1", "pg/mL", "0.2 - 1.4 M, 0.1 - 1.5 F"]],
    ["Male 0.2 - 1.4", "IGF-1 | 180", "NT-proBNP | 85", "0.2 - 1.4 M, 0.1 - 1.5 F"]);
  await lis("Q10 serology + blood group, LIS rows", ["HIV 1 & 2 Antibody  Non Reactive", "Dengue NS1 Antigen  Negative", "Anti HCV (Rapid)  Non Reactive", "Blood Group (ABO & Rh)  B Positive", "Malaria Antigen (Pf/Pv)  Not Detected"],
    [/HIV.*Non Reactive/, /NS1 Antigen.*Negative/, /HCV.*Non Reactive/, /B Positive/, /Not Detected/]);
  await tbl("Q11 units in parentheses after the test name", [["Intact PTH (pg/mL)", "45", "", "15 - 65"], ["Progesterone (ng/mL)", "0.5", "", "0.2 - 1.5"], ["CA 19-9 (U/mL)", "12", "", "< 37"], ["Lp(a) (mg/dL)", "25", "", "< 30"]],
    [/PTH.*45/, /Progesterone.*0\.5/, /CA 19-9.*12/, /Lp\(a\).*25/]);
  await tbl("Q12 hormone phase ranges", [["FSH", "6.5", "mIU/mL", "Follicular: 3.5 - 12.5"], ["", "", "", "Ovulation: 4.7 - 21.5"], ["", "", "", "Luteal: 1.7 - 7.7"], ["Progesterone", "0.8", "ng/mL", "Follicular: 0.2 - 1.5"], ["", "", "", "Luteal: 1.7 - 27.0"]],
    ["Ovulation: 4.7 - 21.5", "Luteal: 1.7 - 7.7", "Luteal: 1.7 - 27.0"]);
  await tbl("Q13 ABG", [["ARTERIAL BLOOD GAS"], ["pH", "7.38", "", "7.35 - 7.45"], ["pCO2", "40", "mmHg", "35 - 45"], ["pO2", "95", "mmHg", "80 - 100"], ["HCO3", "24", "mmol/L", "22 - 26"], ["Base Excess", "-1.2", "mmol/L", "-2 to +2"], ["SO2", "97", "%", "95 - 100"], ["FiO2", "21", "%"], ["Temperature", "37.0", "C"]],
    ["pH | 7.38", "pCO2 | 40", "pO2 | 95", "HCO3 | 24", "Base Excess | -1.2", "SO2 | 97", "FiO2 | 21"]);
  await tbl("Q14 cardiac + tumour markers", [["Troponin I (hs)", "4.2", "ng/L", "< 19.8"], ["CK-MB", "18", "U/L", "< 25"], ["NT-proBNP", "85", "pg/mL", "< 125"], ["PSA, Total", "1.2", "ng/mL", "< 4.0"], ["CEA", "2.1", "ng/mL", "< 5.0"], ["CA 125", "18", "U/mL", "< 35"], ["CA 19-9", "12", "U/mL", "< 37"], ["CA 15-3", "14", "U/mL", "< 30"], ["AFP", "3.1", "ng/mL", "< 8.1"], ["Beta hCG", "< 2.0", "mIU/mL", "< 5.0"]],
    ["Troponin I (hs) | 4.2", "CK-MB | 18", "NT-proBNP | 85", "PSA, Total | 1.2", "CEA | 2.1", "CA 125 | 18", "CA 19-9 | 12", "CA 15-3 | 14", "AFP | 3.1", "Beta hCG | < 2.0"]);
  await tbl("Q15 comparison signs, up to, flags", [["SGPT (ALT)", "35", "U/L", "Up to 41"], ["Troponin I", "<0.01", "ng/mL", "<0.04"], ["Vitamin B12", ">2000", "pg/mL", "211 - 911"], ["Uric Acid", "7.9 H", "mg/dL", "upto 7.0"], ["Ferritin", "18 *", "ng/mL", "30 - 400"]],
    ["Up to 41", "<0.01", ">2000", "7.9 H", "upto 7.0", "18 *"]);
  await pdfCase("Q15b arrows and ≤/≥ (Unicode font)", "blood_report", [[...PATIENT, ...HEADER,
    at(40, 620, "Haemoglobin"), at(235, 620, "12.1 ↓", { indic: true }), at(305, 620, "g/dL"), at(385, 620, "13.0 - 17.0"),
    at(40, 605, "Triglycerides"), at(235, 605, "180 ↑", { indic: true }), at(305, 605, "mg/dL"), at(385, 605, "≤ 150", { indic: true }),
    at(40, 590, "eGFR"), at(235, 590, "98"), at(305, 590, "mL/min/1.73m2"), at(385, 590, "≥ 90", { indic: true }),
  ]], S, ["12.1 ↓", "180 ↑", "≤ 150", "≥ 90"]);
  await pdfCase("Q16 cumulative columns with dated header", "blood_report", [[...PATIENT,
    at(40, 640, "Test"), at(200, 640, "12/10/2026"), at(260, 640, "15/04/2026"), at(320, 640, "Unit"), at(385, 640, "Ref. Range"),
    ...tableByRow(620, [40, 200, 260, 320, 385], [["Haemoglobin", "12.1", "12.8", "g/dL", "13.0 - 17.0"], ["Ferritin", "24", "41", "ng/mL", "30 - 400"]]),
  ]], S, ["15/04/2026", "Haemoglobin | 12.1 | 12.8"]);
  await lis("Q17 LIS rows: no unit between value and range / unit after range", ["Haemoglobin  12.1  13.0 - 17.0  g/dL", "Total Leucocyte Count  7200  4000 - 11000  /cumm", "Urea / Creatinine Ratio  27.78  10 - 20"],
    [/Haemoglobin 12\.1/, /Leucocyte Count 7200/, /Ratio 27\.78/]);
});
