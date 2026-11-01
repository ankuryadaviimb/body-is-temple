import { it } from "vitest";
import { pdfCase, at } from "./harness";
import type { Item } from "./pdfx";

const LETTERHEAD: Item[] = [at(40, 810, "Dr. Neha Rao", { size: 14 }), at(40, 794, "MBBS, MD (Medicine)")];

it("C prescriptions", async () => {
  await pdfCase("C1 unlabeled patient line with weight and BP (EMR Rx header)", "prescription", [[
    ...LETTERHEAD,
    at(40, 760, "Arjun Mehta"), at(140, 760, "41 Y / Male"), at(230, 760, "Wt: 70 kg"), at(300, 760, "BP: 120/80 mmHg"), at(430, 760, "12/10/2026"),
    at(40, 730, "Rx"),
    at(60, 714, "1. Tab. Pantoprazole 40 mg | 1-0-0 | Before breakfast | 30 days"),
  ]], ["Arjun", "Mehta", "41 Y"], ["Tab. Pantoprazole 40 mg"]);
  await pdfCase("C1b unlabeled vitals line with name (consultation)", "consultation", [[
    at(40, 760, "Arjun Mehta (41 Y / M) Wt: 70 kg, Ht: 172 cm, BMI: 23.7"),
    at(40, 730, "Diagnosis : Pelvic floor dyssynergia"),
  ]], ["Arjun", "Mehta"], ["Pelvic floor dyssynergia"]);
  await pdfCase("C2 Rx symbol on the same baseline as the name", "prescription", [[
    ...LETTERHEAD,
    at(40, 760, "Rx"), at(300, 760, "Arjun Mehta, 41/M"),
    at(60, 744, "1. Tab. Pantoprazole 40 mg OD"),
  ]], ["Arjun", "Mehta"], ["Tab. Pantoprazole 40 mg OD"]);
  await pdfCase("C3 name next to a medicine line, name never labeled", "prescription", [[
    ...LETTERHEAD,
    at(40, 760, "Arjun Mehta"), at(300, 760, "12/10/2026"),
    at(40, 744, "Arjun Mehta"), at(140, 744, "Tab. Pantoprazole 40 mg OD"),
  ]], ["Arjun", "Mehta"], ["Tab. Pantoprazole 40 mg OD"]);
  await pdfCase("C3b name next to a medicine line, name labeled elsewhere", "prescription", [[
    ...LETTERHEAD,
    at(40, 760, "Name : Arjun Mehta"),
    at(40, 744, "Arjun Mehta"), at(140, 744, "Tab. Pantoprazole 40 mg OD"),
  ]], ["Arjun", "Mehta"], ["Tab. Pantoprazole 40 mg OD"]);
  await pdfCase("C3c 'Patient:' on the medicine line (over-redaction check)", "prescription", [[
    ...LETTERHEAD,
    at(40, 744, "Patient: Arjun Mehta"), at(200, 744, "Tab. Pantoprazole 40 mg OD"),
  ]], ["Arjun", "Mehta"], ["Tab. Pantoprazole 40 mg OD"]);
  await pdfCase("C4 pediatric B/O", "prescription", [[
    ...LETTERHEAD,
    at(40, 760, "B/O Anita Devi | 3 M | Wt 5.2 kg"),
    at(40, 744, "Baby of Anita Devi - Syp. Paracetamol 2.5 ml SOS"),
    at(40, 728, "BABY OF KAVYA IYER - Drops Vitamin D3 400 IU OD"),
  ]], ["Anita", "Devi", "Kavya", "Iyer"], ["Syp. Paracetamol 2.5 ml SOS"]);
  await pdfCase("C5 clinic timings carry the 'daily' dose word", "prescription", [[
    ...LETTERHEAD,
    at(40, 770, "Sunrise Gut Care, Baner | OPD 10 am - 2 pm daily"),
    at(40, 754, "Open daily except Sunday: Sunrise Family Clinic, Aundh"),
    at(40, 730, "Rx"),
    at(60, 714, "Tab. Pantoprazole 40 mg OD"),
  ]], ["Sunrise", "Baner", "Aundh"], ["Tab. Pantoprazole 40 mg OD"]);
});

it("C honorifics, phones, emails in kept advice lines", async () => {
  const adv = (id: string, line: string, secrets: string[]) =>
    pdfCase(id, "consultation", [[at(40, 760, "Advice :"), at(40, 744, line)]], secrets, []);
  await adv("C6a Sh.", "Sh. Ramesh Kumar to continue current dose", ["Ramesh"]);
  await adv("C6b Tmt./Thiru", "Tmt. Lakshmi and Thiru Murugan counselled", ["Lakshmi", "Murugan"]);
  await adv("C6c Mast./Mohd./Er.", "Mast. Arjun; Mohd. Imran; Er. Rahul Verma", ["Arjun", "Imran", "Rahul"]);
  await adv("C6d Kum./Km (lowercase name follows)", "Kum. anita and Km. pooja", ["anita", "pooja"]);
  await adv("C6e Smt (control)", "Smt. Anita Devi to continue", ["Anita"]);
  await adv("C6f Shrimati / Sushri / Selvi", "Shrimati Anita, Sushri Pooja, Selvi Priya", ["Anita", "Pooja", "Priya"]);
  await adv("C7a +91 20 landline", "For emergencies call +91 20 4123 4567", ["4123 4567"]);
  await adv("C7b 1860 toll-free", "Helpdesk 1860-500-1234 for reports", ["500-1234"]);
  await adv("C7c 2-4-4 mobile grouping", "Call 98 4501 2345 before visiting", ["4501 2345"]);
  await adv("C7d 4-3-3 mobile grouping", "Call 9845 012 345 before visiting", ["012 345"]);
  await adv("C7e 8-digit local landline", "Call 4123 4567 before visiting", ["4123 4567"]);
  await adv("C7f mobile with dots", "Call 98450.12345 before visiting", ["12345"]);
  await adv("C7g +91-22 Mumbai", "Call +91-22-6123-4567 before visiting", ["6123-4567"]);
  await adv("C7h mobile control 98450 12345", "Call 98450 12345 before visiting", ["98450 12345"]);
  await adv("C8a .care URL", "Book online at sunrisegut.care", ["sunrisegut"]);
  await adv("C8b .co URL", "Book online at sunrisegut.co", ["sunrisegut"]);
  await adv("C8c obfuscated email", "Send reports to rahul.sharma [at] gmail [dot] com", ["rahul.sharma"]);
  await adv("C8d bare domain .health", "Results on sunrise.health/app", ["sunrise.health"]);
});

it("C scans, physio, Hindi/Tamil", async () => {
  await pdfCase("C9 radiology sign-off without Dr", "scan", [[
    at(40, 800, "USG ABDOMEN AND PELVIS"),
    at(40, 780, "IMPRESSION :"),
    at(40, 764, "Grade I fatty liver. No calculi."),
    at(40, 740, "Radiologist : Priya Nair"),
    at(40, 724, "Electronically signed: Priya Nair, DNB"),
    at(40, 708, "Sonologist - Kavya Iyer"),
  ]], ["Priya", "Nair", "Kavya", "Iyer"], ["Grade I fatty liver"]);
  await pdfCase("C10 pelvic-floor physio note", "consultation", [[
    at(40, 800, "Assessment : Paradoxical puborectalis contraction on push"),
    at(40, 784, "Plan : Biofeedback 2 sessions/week x 4 weeks"),
    at(40, 768, "Priya Nair, MPT (Women's Health)"),
    at(40, 752, "Pelvic Floor Physiotherapist, Sunrise Physio Studio"),
    at(40, 736, "Therapist: Kavya Iyer, BPT"),
  ]], ["Priya", "Nair", "Kavya", "Iyer", "Sunrise"], ["Biofeedback 2 sessions/week"]);
  await pdfCase("C11 Hindi label + name inside a kept Hindi advice line", "consultation", [[
    at(40, 800, "नाम : राहुल शर्मा", { indic: true }),
    at(40, 780, "Advice :"),
    at(40, 764, "राहुल शर्मा रोज़ 3 लीटर पानी पिएं", { indic: true }),
  ]], ["राहुल", "शर्मा"], []);
  await pdfCase("C12 Tamil label + name inside a kept line", "consultation", [[
    at(40, 800, "பெயர் : ராகுல் சர்மா", { indic: true }),
    at(40, 780, "Advice :"),
    at(40, 764, "சர்மா தினமும் தண்ணீர் குடிக்க வேண்டும்", { indic: true }),
  ]], ["சர்மா", "ராகுல்"], []);
  await pdfCase("C13 bilingual name label harvests the English part", "consultation", [[
    at(40, 800, "नाम /", { indic: true }), at(70, 800, "Name : RAHUL SHARMA"),
    at(40, 780, "Impression : Rahul has dyssynergia"),
  ]], ["Rahul"], ["dyssynergia"]);
});
