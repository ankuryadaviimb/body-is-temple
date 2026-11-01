import { it } from "vitest";
import { pdfCase, textCase, at, tableByRow } from "./harness";
import type { Item } from "./pdfx";
const PATIENT: Item[] = [at(40, 800, "Patient Name :"), at(150, 800, "Mr. RAHUL SHARMA"), at(330, 800, "Reported On :"), at(400, 800, "12/10/2026")];
const LABHDR: Item[] = [at(40, 640, "Investigation"), at(235, 640, "Observed Value"), at(320, 640, "Unit"), at(385, 640, "Bio. Ref. Interval")];
it("H quick", async () => {
  await pdfCase("H1 marketing footer with % and PIN", "blood_report", [[...PATIENT, ...LABHDR,
    ...tableByRow(620, [40, 235, 320, 385], [["Haemoglobin", "13.5", "g/dL", "13.0 - 17.0"]]),
    at(40, 90, "Get 20% off on your next full body checkup at Sunrise Path Labs, Baner, Pune 411045"),
  ]], ["Sunrise", "Baner", "411045"], ["Haemoglobin | 13.5"]);
  textCase("H2 uppercase MASTER/BABY/KUMARI in an advice window", "consultation",
    "Advice :\nMASTER ARJUN MEHTA to continue syrup\nBABY ANITA to be reviewed\nKUMARI POOJA IYER counselled", ["ARJUN", "ANITA", "POOJA"]);
  textCase("H3 harvest: 'Name : KUMARI POOJA IYER' then 'Pooja' in advice", "consultation",
    "Name : KUMARI POOJA IYER\nAdvice : Pooja to avoid straining", ["Pooja"]);
  textCase("H4 harvest blocked by a test-word name (ANA)", "consultation",
    "Name : ANA DSOUZA\nImpression : Ana has IBS-C", ["Ana has"]);
});
