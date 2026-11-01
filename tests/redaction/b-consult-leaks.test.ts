import { it } from "vitest";
import { pdfCase, at } from "./harness";
import type { Item } from "./pdfx";

// A gastro OPD note as EMR software prints it. Letterhead variants are swapped in.
const BODY = (top: Item[]): Item[] => [
  ...top,
  at(40, 740, "Patient :"), at(100, 740, "Arjun Mehta"), at(260, 740, "Age/Sex : 41/M"), at(420, 740, "Date : 12/10/2026"),
  at(40, 720, "Chief Complaints : Straining at stool x 6 months"),
  at(40, 704, "History : Incomplete evacuation, uses phone in toilet"),
  at(40, 688, "Diagnosis : Pelvic floor dyssynergia"),
  at(40, 672, "Advice :"),
  at(60, 656, "1. Biofeedback therapy, 8 sessions"),
  at(60, 640, "2. Psyllium husk 2 tsp at night with water"),
  at(40, 624, "Follow up after 4 weeks"),
  at(400, 600, "Neha Rao"),
  at(40, 586, "Sunrise Gut & Liver Care, Opp. Lake Mall, Paud Rd., Baner"),
  at(40, 572, "Appointments: +91 20 4123 4567 | 1860 500 1234 | 98 4501 2345"),
];
const SECRETS = ["Arjun", "Mehta", "41/M", "Neha", "Rao", "Sunrise", "Forum", "Paud", "Baner", "4123 4567", "1860 500 1234", "98 4501 2345"];
const KEEP = ["Diagnosis : Pelvic floor dyssynergia", "Biofeedback therapy, 8 sessions"];

it("B consultation leaks", async () => {
  await pdfCase("B1a letterhead 'Dr. Neha Rao'", "consultation", [BODY([at(40, 800, "Dr. Neha Rao", { size: 14 }), at(40, 784, "MBBS, MD, DM (Gastroenterology)"), at(40, 770, "Reg. No. MMC 45678")])], SECRETS, KEEP);
  await pdfCase("B1b letterhead 'NEHA RAO' without Dr", "consultation", [BODY([at(40, 800, "NEHA RAO", { size: 14 }), at(40, 784, "MBBS, MD, DM (Gastroenterology)")])], SECRETS, KEEP);
  await pdfCase("B1c letterhead 'Dr.(Mrs.) Neha Rao'", "consultation", [BODY([at(40, 800, "Dr.(Mrs.) Neha Rao", { size: 14 }), at(40, 784, "MBBS, MD, DM (Gastroenterology)")])], SECRETS, KEEP);

  // Names in free text when the label is not harvested.
  const impression = (label: Item[], id: string) =>
    pdfCase(id, "consultation", [[
      ...label,
      at(40, 760, "Impression : Rahul is a 34-year-old male with dyssynergic defecation"),
      at(40, 744, "Advice : Rahul Sharma to continue biofeedback; review with Sharma family"),
    ]], ["Rahul", "Sharma", "34-year"], [/dyssynergic defecation/]);
  await impression([at(40, 800, "P a t i e n t  N a m e : Rahul Sharma")], "B2 letter-spaced label");
  await impression([at(40, 800, "Patient Name"), at(112, 800, "Rahul Sharma")], "B3 label then value, small gap, no colon");
  await impression([at(40, 800, "Patient Name :"), at(150, 794, "Rahul Sharma")], "B4 value 6pt below label baseline");
  await impression([at(40, 800, "Name. Rahul Sharma")], "B4b 'Name.' with a period");
  await impression([at(40, 800, "NAME OF PATIENT : RAHUL SHARMA")], "B5a NAME OF PATIENT");
  await impression([at(40, 800, "Pt.Name: Rahul Sharma")], "B5b Pt.Name");
  await impression([at(40, 800, "Patient's Name : Rahul Sharma")], "B5c Patient's Name");
  await impression([at(40, 800, "Name :- Mr. Rahul Sharma")], "B5d Name :-");
  // Known limit: only the initial "R" is given, so the first name "Rahul" in free text cannot be
  // tied to the person. This is why free-text documents are sent only after the person's OK.
  await pdfCase("B5e unlabeled 'Mr. R Sharma' (known limit: first name never labelled)", "consultation", [[
    at(40, 800, "Mr. R Sharma, 34 Y"),
    at(40, 760, "Impression : Rahul is a 34-year-old male with dyssynergic defecation"),
    at(40, 744, "Advice : Rahul Sharma to continue biofeedback; review with Sharma family"),
  ]], ["Sharma", "34-year"], [/dyssynergic defecation/]);

  // Ages in free text (name harvested so only the age is at stake).
  for (const [id, line, secret] of [
    ["B6a 34-year-old", "Impression : 34-year-old male with chronic constipation", "34-year"],
    ["B6b aged 34", "Impression : Male aged 34 with chronic constipation", "aged 34"],
    ["B6c 34 Male", "Impression : 34 Male, chronic constipation", "34 Male"],
    ["B6d M 34", "Impression : M 34, chronic constipation", "M 34"],
    ["B6e 34 Years 5 Months", "Impression : 34 Years 5 Months old, chronic constipation", "5 Months"],
    ["B6f 34-yr-old", "Impression : 34-yr-old with chronic constipation", "34-yr"],
    ["B6g thirty-four", "Impression : Thirty-four year old man, chronic constipation", "Thirty-four"],
    ["B6h 34 Y 2 M", "Impression : 34 Y 2 M male, chronic constipation", "34 Y"],
    ["B6i Age:34yrs inline", "Impression : (Age:34yrs) chronic constipation", "34"],
  ] as const) {
    await pdfCase(id, "consultation", [[at(40, 800, "Name : Rahul Sharma"), at(40, 760, line)]], [secret, "Rahul"], [/constipation/]);
  }
});
