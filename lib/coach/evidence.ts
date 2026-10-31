import type { CoachIntent } from "@/lib/domain/coach/intents";

/**
 * Evidence cards: short, sourced notes that keep the coach grounded. Generic knowledge
 * only (no personal data), picked per question so each AI call stays small.
 */

export type EvidenceCard = { id: string; text: string; source: string };

export const EVIDENCE: EvidenceCard[] = [
  {
    id: "red_flags",
    text: "See a doctor promptly for: bleeding more than a streak on the paper, black or tarry stool, fever with belly pain, severe or worsening pain, vomiting with a swollen belly or no gas passing, weight loss without trying, or low iron (anemia) on blood tests.",
    source: "Red flag guidance in ACG and NICE guidelines",
  },
  {
    id: "biofeedback",
    text: "For dyssynergic defecation, biofeedback with a pelvic floor physiotherapist is the first-line treatment and helps most patients in trials. Home breathing and relaxation practice supports it but does not replace it.",
    source: "ANMS-ESNM consensus on biofeedback therapy (Rao and others, 2015)",
  },
  {
    id: "no_strain",
    text: "Straining while holding the breath tightens the pelvic floor and raises pressure on the anal canal, which is linked to fissures and piles. Breathe out slowly, let the belly soften, and stop after about 5 minutes if nothing moves.",
    source: "AGA technical review on constipation (2013); pelvic floor physiotherapy practice",
  },
  {
    id: "posture",
    text: "A footstool that lifts the knees above the hips, leaning forward with elbows on knees, straightens the anorectal angle and can make emptying easier with less strain.",
    source: "Modi and others, J Clin Gastroenterol 2019 (defecation posture device)",
  },
  {
    id: "false_alarm",
    text: "A feeling of incomplete emptying or rectal heaviness is common in dyssynergia, even when the rectum is nearly empty. Repeated trips and straining tend to keep the cycle going; relaxing the pelvic floor and waiting for a clear urge usually works better.",
    source: "Rao, Dyssynergic defecation and biofeedback therapy (Gastroenterol Clin North Am 2008)",
  },
  {
    id: "gastrocolic",
    text: "The colon is most active soon after waking and in the hour after a meal (the gastrocolic reflex), so these are the best times to try. A steady wake time and breakfast help this reflex.",
    source: "Colonic motility studies; bowel habit training guidance",
  },
  {
    id: "psyllium",
    text: "Psyllium (isabgol) holds water and softens stool. It is gel-forming and less gassy than many fibers. It works best with enough water and at a steady daily time; raise the dose slowly if it causes bloating.",
    source: "AGA-ACG guideline on chronic idiopathic constipation (2023)",
  },
  {
    id: "gas_foods",
    text: "Common gas makers are beans and chickpeas (chana, rajma), large amounts of lentils, onion and garlic, cabbage-family vegetables, milk for people who do not digest lactose, and sugar-free sweets. Swallowed air from eating fast or fizzy drinks adds to it. People differ, so personal logs matter more than lists.",
    source: "NIDDK guidance on gas; Monash University FODMAP research",
  },
  {
    id: "walk",
    text: "A 10 to 15 minute walk after meals helps gas move and eases bloating. Regular aerobic exercise is linked to better bowel movements.",
    source: "Clinical trial on post-meal activity and bloating (PMC8035544); exercise and constipation meta-analysis (Gao and others, 2019)",
  },
  {
    id: "fissure",
    text: "After fissures or piles, what matters most is soft formed stool (type 4), no straining, and short toilet visits. Warm sitz baths ease pain. New sharp pain or bleeding more than a streak needs a doctor.",
    source: "ASCRS clinical practice guideline for anal fissures (2023)",
  },
  {
    id: "stress",
    text: "Stress and anxiety tighten the pelvic floor and make gut sensations feel stronger (the gut-brain connection). Slow breathing with a long exhale calms both.",
    source: "Rome Foundation work on disorders of gut-brain interaction",
  },
  {
    id: "breath_lifting",
    text: "During lifts, push-ups and core work, breathe out on the effort and avoid holding the breath. Long squeezes such as mula bandha holds may not suit a pelvic floor that needs to relax; check with a pelvic floor physio.",
    source: "Pelvic floor physiotherapy practice",
  },
  {
    id: "protein",
    text: "People who train usually aim for about 1.2 to 2.0 g of protein per kg of body weight a day. Gentle sources for a sensitive gut include paneer, curd, tofu and moong dal, plus eggs or fish for those who eat them.",
    source: "ISSN position stand on protein and exercise (2017)",
  },
  {
    id: "late_dinner",
    text: "Eating 2 to 3 hours before bed gives the stomach time to empty, which eases reflux and night-time bloating for many people.",
    source: "Reflux and meal timing guidance (ACG 2022 GERD guideline)",
  },
];

/** Most relevant cards first, per question type. The red flag card always comes along. */
const PRIORITY: Record<CoachIntent, string[]> = {
  should_go: ["red_flags", "false_alarm", "no_strain", "gastrocolic", "posture"],
  heavy: ["red_flags", "false_alarm", "stress", "no_strain", "biofeedback"],
  morning: ["red_flags", "psyllium", "gastrocolic", "late_dinner", "no_strain"],
  gas: ["red_flags", "gas_foods", "walk", "late_dinner", "stress"],
  ate_right: ["red_flags", "gas_foods", "protein", "walk"],
  dinner: ["red_flags", "gas_foods", "late_dinner", "protein"],
  free: ["red_flags", "biofeedback", "no_strain", "fissure", "breath_lifting", "psyllium"],
};

export function evidenceFor(intent: CoachIntent): EvidenceCard[] {
  return PRIORITY[intent].map((id) => EVIDENCE.find((c) => c.id === id)).filter((c): c is EvidenceCard => c !== undefined);
}

export function evidenceText(cards: EvidenceCard[]): string {
  return cards.map((c) => `- ${c.text} (Source: ${c.source})`).join("\n");
}
