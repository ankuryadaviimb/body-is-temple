import { it } from "vitest";
import { pdfCase, at } from "./harness";

it("D mixed-script lines", async () => {
  await pdfCase("D1 Hindi-labelled patient line with a unit", "consultation", [[
    at(40, 800, "रोगी का नाम : राहुल शर्मा | आयु : 34 वर्ष |", { indic: true }), at(300, 800, "Wt: 70 kg"),
    at(40, 780, "Diagnosis : Pelvic floor dyssynergia"),
  ]], ["राहुल", "शर्मा", "34 वर्ष"], ["Pelvic floor dyssynergia"]);
  await pdfCase("D2 Tamil-labelled patient line with a unit (blood report)", "blood_report", [[
    at(40, 800, "பெயர் : ராகுல் சர்மா | வயது : 34", { indic: true }), at(300, 800, "Wt: 70 kg"),
    at(40, 760, "Haemoglobin 12.1 g/dL 13.0 - 17.0"),
  ]], ["சர்மா", "ராகுல்"], ["Haemoglobin 12.1 g/dL 13.0 - 17.0"]);
  await pdfCase("D3 Devanagari name inside a mixed advice line", "consultation", [[
    at(40, 800, "Advice :"),
    at(40, 784, "Psyllium 2 tsp HS -", ), at(150, 784, "राहुल शर्मा", { indic: true }),
  ]], ["राहुल", "शर्मा"], ["Psyllium 2 tsp HS"]);
  await pdfCase("D4 Hindi address line with English city in a kept footer", "consultation", [[
    at(40, 800, "Advice : Walk 30 min daily"),
    at(40, 784, "सनराइज़ क्लिनिक, बानेर,", { indic: true }), at(200, 784, "Pune"),
  ]], ["Pune"], ["Walk 30 min daily"]);
});
