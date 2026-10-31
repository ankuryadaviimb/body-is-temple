/**
 * Food names from meal analysis, normalized so the same dish counts as one food
 * ("2 rotis", "chapati" and "phulka" are all "roti"). Pure, no I/O.
 */

const SYNONYMS: Record<string, string> = {
  chole: "chana",
  chhole: "chana",
  choley: "chana",
  chholey: "chana",
  "chana masala": "chana",
  "chole masala": "chana",
  "kala chana": "chana",
  "black chana": "chana",
  chickpea: "chana",
  chickpeas: "chana",
  "chickpea curry": "chana",
  puri: "poori",
  puris: "poori",
  pooris: "poori",
  chapati: "roti",
  chapatis: "roti",
  chapathi: "roti",
  phulka: "roti",
  phulkas: "roti",
  rotis: "roti",
  "wheat roti": "roti",
  "rajma masala": "rajma",
  "kidney beans": "rajma",
  "kidney bean curry": "rajma",
  dahi: "curd",
  yogurt: "curd",
  yoghurt: "curd",
  "plain curd": "curd",
  "dal tadka": "dal",
  "dal fry": "dal",
  "toor dal": "dal",
  "arhar dal": "dal",
  "masoor dal": "dal",
  "yellow dal": "dal",
  "moong dal": "moong dal",
  "green moong": "moong",
  peanut: "peanuts",
  groundnut: "peanuts",
  groundnuts: "peanuts",
  idlis: "idli",
  dosas: "dosa",
  parathas: "paratha",
  samosas: "samosa",
  pakoras: "pakora",
  pakodas: "pakora",
  pakoda: "pakora",
  bhaji: "pakora",
  "steamed rice": "rice",
  "white rice": "rice",
  "plain rice": "rice",
  "boiled egg": "egg",
  "boiled eggs": "egg",
  eggs: "egg",
  "masala chai": "tea",
  chai: "tea",
};

const FILLER =
  /\b(\d+(\.\d+)?|one|two|three|four|half|small|large|big|medium|bowl|bowls|plate|plates|piece|pieces|pcs|cup|cups|glass|glasses|serving|servings|slice|slices|tbsp|tsp|spoon|spoons|of|with|and|some|a|an|the|homemade|home made|fresh)\b/g;

/** Lowercase, quantity-free dish name, or null when nothing meaningful is left. */
export function normalizeFood(name: string): string | null {
  const n = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(FILLER, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (n.length < 2) return null;
  return SYNONYMS[n] ?? n;
}

/** "moong dal" to "Moong dal". */
export function foodLabel(food: string): string {
  return food.charAt(0).toUpperCase() + food.slice(1);
}
