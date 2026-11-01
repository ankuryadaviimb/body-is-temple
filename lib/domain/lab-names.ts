/**
 * Lab test names: one canonical name per test across labs, and a check for whether a
 * line of a report names a test at all (used to decide what may go to the AI). Pure.
 */

/**
 * Canonical names, so one test lines up across reports from different labs. Each rule may
 * carry exclusions: related but different tests share words with a main test ("Non-HDL",
 * "TC/HDL ratio", "Mean platelet volume", "Hemoglobin A1c", "Bilirubin, direct") and
 * must never be merged into it, or trends would compare unrelated values.
 */
const CANONICAL: [RegExp, string, RegExp?][] = [
  [/(hb\s*a1c|\ba1c\b|glycated|glycosylated)/i, "HbA1c"],
  [/^(haemoglobin|hemoglobin|hb|hgb)\b/i, "Hemoglobin", /a1c|glycated|glycosylated|mean|urine|electrophoresis|\bf\b|fetal/i],
  [/(vitamin\s*b\s*-?\s*12|vit\.?\s*b\s*12|\bb12\b|cyanocobalamin|cobalamin)/i, "Vitamin B12", /holo|active/i],
  [/(25\s*-?\s*(oh|hydroxy)|vitamin\s*d|vit\.?\s*d\b|vit\.?\s*d3|cholecalciferol)/i, "Vitamin D (25-OH)", /dihydroxy|1\s*,\s*25|calcitriol/i],
  [/^(tsh|thyroid stimulating hormone)\b/i, "TSH", /antibod|receptor|\btrab\b|\btsi\b/i],
  [/^(free\s*t4|ft4|t4\s*,?\s*free)\b/i, "Free T4"],
  [/^(free\s*t3|ft3|t3\s*,?\s*free)\b/i, "Free T3"],
  [/^(total\s*)?t4\b|^thyroxine\b/i, "T4", /free|uptake|binding/i],
  [/^(total\s*)?t3\b|^triiodothyronine\b/i, "T3", /free|reverse|uptake|binding/i],
  [/ferritin/i, "Ferritin"],
  [/^(serum\s*)?iron\b/i, "Iron", /binding|saturation|tibc|uibc/i],
  [/^(tibc|total iron binding)/i, "TIBC"],
  [/(fasting\s*(blood|plasma)?\s*(sugar|glucose)|glucose\s*,?\s*fasting|\bfbs\b)/i, "Fasting glucose"],
  [/(post\s*prandial|\bppbs\b|glucose\s*,?\s*pp)/i, "Post-meal glucose"],
  [/^(total\s*cholesterol|cholesterol\s*,?\s*total|serum cholesterol|cholesterol)$/i, "Total cholesterol"],
  [/\bldl\b/i, "LDL cholesterol", /particle|\bsize\b|small|dense|\bsd\b|oxidi[sz]ed/i],
  [/\bhdl\b/i, "HDL cholesterol"],
  [/^(triglycerides?|tg)\b/i, "Triglycerides"],
  [/creatinine/i, "Creatinine", /kinase/i],
  [/(sgpt|\balt\b|alanine aminotransferase)/i, "ALT (SGPT)"],
  [/(sgot|\bast\b|aspartate aminotransferase)/i, "AST (SGOT)"],
  [/^(serum\s*|total\s*)?calcium\b/i, "Calcium", /ioni[sz]ed|corrected|free/i],
  [/(hs\s*-?\s*crp|c\s*-?\s*reactive protein|\bcrp\b)/i, "CRP"],
  [/^esr\b|erythrocyte sedimentation/i, "ESR"],
  [/^(platelets?|platelet count|plt)\b/i, "Platelets", /volume|width|crit|large|distribution|mean|\bmpv\b|\bpdw\b|\bpct\b/i],
  [/(\bwbc\b|white blood cell|total leu[ck]ocyte|\btlc\b)/i, "WBC", /\bpus\b|esterase/i],
  [/^mcv\b|mean corpuscular volume/i, "MCV"],
  [/uric acid/i, "Uric acid"],
  [/^(serum\s*)?sodium\b/i, "Sodium"],
  [/^(serum\s*)?potassium\b/i, "Potassium"],
  [/^(serum\s*)?magnesium\b/i, "Magnesium"],
  [/^(serum\s*)?folate|folic acid/i, "Folate", /\brbc\b|red cell/i],
  [/^(total\s*)?bilirubin/i, "Bilirubin", /\b(in)?direct\b|\b(un)?conjugated\b/i],
  [/^(serum\s*)?albumin\b/i, "Albumin", /micro|globulin/i],
];

// Derived values and other samples: never merged into a blood test of a similar name.
const DERIVED = /\b(ratio|index|clearance|excretion|antibod(y|ies)|auto-?antibod(y|ies))\b|\bnon[\s-]*hdl\b|\burine\b|\burinary\b|\b24\s*-?\s*h(ou)?rs?\b|\bhpf\b|\bstool\b|\bcsf\b/i;
// "SGPT/ALT" names one test twice; any other "a/b" is a ratio of two tests.
const SAME_TEST_PAIR = /^\s*(sgpt\s*\/\s*alt|alt\s*\/\s*sgpt|sgot\s*\/\s*ast|ast\s*\/\s*sgot)\b/i;

/** One name per test, so the same marker lines up across reports from different labs. */
export function canonicalMarker(name: string): string {
  const n = name.replace(/\s+/g, " ").trim();
  const derived = DERIVED.test(n) || (n.includes("/") && !SAME_TEST_PAIR.test(n));
  if (!derived) {
    for (const [re, canonical, unless] of CANONICAL) if (re.test(n) && !(unless && unless.test(n))) return canonical;
  }
  return n.length > 80 ? n.slice(0, 80) : n;
}


// Common tests the canonical list does not cover, as words that appear on a result line.
const TEST_WORDS = new RegExp(
  "\\b(" +
    [
      "rbc", "red blood cells?", "neutrophils?", "lymphocytes?", "monocytes?", "eosinophils?", "basophils?",
      "ha?ematocrit", "pcv", "mch", "mchc", "rdw", "reticulocytes?", "glucose", "sugar", "urea", "bun", "egfr",
      "globulin", "protein", "alkaline phosphatase", "alp", "ggt", "gamma", "amylase", "lipase", "chloride",
      "bicarbonate", "phosph(?:orus|ate)", "zinc", "copper", "psa", "testosterone", "estradiol", "cortisol",
      "prolactin", "insulin", "c-?peptide", "homocysteine", "vldl", "apolipoprotein", "lipoprotein", "cholesterol",
      "prothrombin", "inr", "aptt", "d-?dimer", "fibrinogen", "hiv", "hbsag", "hcv", "vdrl", "widal", "dengue",
      "malaria", "occult blood", "specific gravity", "ketones?", "nitrites?", "urobilinogen", "epithelial",
      "casts?", "crystals?", "bacteria", "pus cells?", "colou?r", "appearance", "transparency", "mucus",
      "ova", "cysts?", "troponin", "bnp", "ck-?mb", "ldh", "transferrin", "saturation", "tibc", "uibc", "lh", "fsh",
      "amh", "dhea", "igm", "igg", "ige", "iga", "ana", "rheumatoid", "aso", "procalcitonin", "lactate",
      // Urine and stool panels
      "ph", "reaction", "volume", "consistency", "blood", "bile\\s*(salts?|pigments?)", "leu[ck]ocytes?", "esterase",
      "rbcs?", "yeast", "amorphous", "deposits?", "fat\\s*globules", "globules", "undigested", "food\\s*particles",
      "parasites?", "reducing\\s*substances?", "mucus\\s*threads?", "spermatozoa", "trichomonas", "albumin", "protein",
      // Other common tests
      "blood\\s*group", "abo", "rh(\\s*typing)?", "ammonia", "homa(-?ir)?", "morphology", "smear", "peripheral",
      "hematocrit", "haematocrit", "ceruloplasmin", "electrophoresis", "osmolality", "anion\\s*gap", "lipase",
      "creatine\\s*kinase", "cpk", "myoglobin", "fibrosis", "beta\\s*hcg", "hcg", "cea", "ca\\s*-?\\s*125", "afp",
      "plt", "s\\.?\\s*cr(eat)?", "fbs", "ppbs", "rbs", "sickle", "g6pd", "coombs", "hplc", "solubility",
    ].join("|") +
    ")\\b",
  "i",
);

/** Whether a line names a lab test (a canonical one, a common one, or a derived value). */
export function mentionsTest(line: string): boolean {
  if (TEST_WORDS.test(line) || /\b(ratio|index|count)\b/i.test(line)) return true;
  // Canonical names are anchored at the start of a name, so try each part of the line
  // ("Plan : Plt 250000/uL, S.Cr: 0.9 mg/dL, TSH 5.6").
  const parts = line.split(/[,;|:]|\s-\s/).map((p) => p.trim()).filter(Boolean);
  return parts.some((part) => CANONICAL.some(([re]) => re.test(part)));
}
