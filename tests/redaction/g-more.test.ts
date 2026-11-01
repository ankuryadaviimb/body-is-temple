import { it } from "vitest";
import { pdfCase, at, tableByRow } from "./harness";
import type { Item } from "./pdfx";

const PATIENT: Item[] = [at(40, 800, "Patient Name :"), at(150, 800, "Mr. RAHUL SHARMA"), at(330, 800, "Reported On :"), at(400, 800, "12/10/2026")];
const LABHDR: Item[] = [at(40, 640, "Investigation"), at(235, 640, "Observed Value"), at(320, 640, "Unit"), at(385, 640, "Bio. Ref. Interval")];
const C2 = [40, 235, 320, 385];

it("G more", async () => {
  await pdfCase("G1 marketing footer with % and PIN", "blood_report", [[...PATIENT, ...LABHDR,
    ...tableByRow(620, C2, [["Haemoglobin", "13.5", "g/dL", "13.0 - 17.0"]]),
    at(40, 90, "Flat 20% off on your next full body checkup at Sunrise Path Labs, Baner, Pune 411045"),
  ]], ["Sunrise", "Baner", "411045", "RAHUL"], ["Haemoglobin | 13.5"]);
  await pdfCase("G2 PIN written with a space in a consultation footer", "consultation", [[
    at(40, 800, "Advice : Walk 30 min daily"),
    at(40, 784, "Sunrise Gut Care, 5th Block, Baner, Pune - 560 034"),
    at(40, 768, "Sunrise Gut Care, Baner, Pune - 560 034"),
  ]], ["Baner", "560 034"], ["Walk 30 min daily"]);
  // A lab report uploaded with kind "other": each panel header starts with "Investigation" and opens an 8-row window.
  await pdfCase("G3 lab report as kind 'other': header opens a prose window", "other", [[...PATIENT, ...LABHDR,
    ...tableByRow(620, C2, [["Haemoglobin", "13.5", "g/dL", "13.0 - 17.0"]]),
    at(40, 590, "Sample processed at Sunrise Path Labs, Baner"),
    at(40, 574, "Priya Nair"), at(40, 560, "Consultant Pathologist"),
  ]], ["Sunrise", "Baner", "Priya", "RAHUL"], ["Haemoglobin | 13.5"]);
  await pdfCase("G4 'Rx' line followed by the unlabeled name line", "prescription", [[
    at(40, 810, "Dr. Neha Rao", { size: 14 }),
    at(40, 780, "Rx"),
    at(40, 764, "Arjun Mehta, 41/M"),
    at(40, 748, "1. Tab. Pantoprazole 40 mg OD"),
  ]], ["Arjun", "Mehta"], ["Tab. Pantoprazole 40 mg OD"]);
  await pdfCase("G5 consultation with a results table below the diagnosis", "consultation", [[
    at(40, 800, "Diagnosis : Pelvic floor dyssynergia"),
    at(40, 784, "Provisional Diagnosis : IBS-C"),
    at(40, 760, "Test"), at(235, 760, "Result"), at(385, 760, "Reference Range"),
    at(40, 744, "TSH"), at(235, 744, "2.1"), at(305, 744, "µIU/mL"), at(385, 744, "0.4 - 4.2"),
    at(40, 720, "Advice : Biofeedback 8 sessions"),
  ]], [], ["Pelvic floor dyssynergia", "IBS-C", "Biofeedback 8 sessions"]);
  await pdfCase("G6 consult note with name in Plan and labelled name", "consultation", [[
    at(40, 800, "Name : Arjun Mehta"), at(300, 800, "Age : 41"),
    at(40, 780, "Plan : Arjun's wife Kavya to help with diet chart"),
    at(40, 764, "Plan : Mehta ji to review in 4 weeks"),
  ]], ["Arjun", "Mehta"], ["diet chart"]);
  // Known limit: a relative's name in free text ("wife Kavya") is never labelled anywhere.
  await pdfCase("G7 Location / Branch labels in a prose window", "consultation", [[
    at(40, 800, "Advice : Repeat LFT after 6 weeks"),
    at(40, 784, "Location: Baner | Branch: Kothrud"),
    at(40, 768, "Collection Point - Aundh"),
    at(40, 752, "Unit of Sunrise Healthcare Ltd"),
  ]], ["Baner", "Kothrud", "Aundh", "Sunrise"], ["Repeat LFT after 6 weeks"]);
  await pdfCase("G8 IDs in a prose window", "consultation", [[
    at(40, 800, "Advice : Repeat LFT after 6 weeks"),
    at(40, 784, "MRD No: AB12345 | Token 57"),
    at(40, 768, "Policy No. 1234/5678/2026 (Star Health TPA)"),
    at(40, 752, "Emp ID 456789 | Corporate: Sunrise Tech"),
  ]], ["AB12345", "1234/5678", "456789"], ["Repeat LFT after 6 weeks"]);
});
