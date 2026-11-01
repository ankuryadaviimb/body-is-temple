import { mentionsTest } from "./lab-names";
import type { DocKind } from "./records";

/**
 * What of a health record may be sent to the AI. Pure, no I/O.
 *
 * An allowlist, not a denylist. A blood report keeps only:
 * - result rows: a known test with a value ("strong"), or a value with its unit ("weak");
 * - section titles ("LIPID PROFILE");
 * - one report date.
 * Everything else is dropped: the patient block, letterheads, addresses, signatures, notes.
 *
 * Then, on what is kept:
 * - rows naming a person, doctor, lab, sample, place or contact are dropped (weak rows also
 *   face the softer checks: "Ref:", "Age", "Patient");
 * - names found anywhere in the document are removed wherever else they appear;
 * - ages, emails, websites, phone numbers, IDs and Indian-script text are removed;
 * - a signature or "informed to ..." trailing a result row is cut off.
 * On each page, rows above the results table header are kept only if they are strong.
 *
 * Consultations, prescriptions, scans and other free text are read only after the person
 * says yes (names in free text cannot be found reliably); they keep the clinical sections
 * (diagnosis, impression, advice, medicines) on top of the rules above, as a best effort.
 *
 * PDF text often comes out column by column, which separates a name from its "Name:"
 * label, so pages are first rebuilt into visual rows from word positions (rowsFromItems).
 */

export type Redacted = { text: string; kept: number; dropped: number };

/** A piece of text on a PDF page; x and y in PDF units (y grows upward), h is the font height. */
export type PositionedText = { str: string; x: number; y: number; w: number; h: number };

/** Rebuilds visual rows (top to bottom, left to right) from positioned text. */
export function rowsFromItems(items: PositionedText[]): string[] {
  // Very large text (a horizontal watermark or logo) is never a result.
  const parts = items.filter((i) => i.str.trim().length > 0 && Number.isFinite(i.x) && Number.isFinite(i.y) && !(i.h > 24));
  parts.sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: { y: number; n: number; h: number; items: PositionedText[] }[] = [];
  for (const it of parts) {
    const last = rows[rows.length - 1];
    // Compare with the row's mean height, so a slightly raised or lowered word still joins.
    const tolerance = Math.max(2, Math.min(Math.max(it.h, last?.h ?? 0), 24) * 0.45);
    if (last && Math.abs(last.y - it.y) <= tolerance) {
      last.items.push(it);
      last.y = (last.y * last.n + it.y) / (last.n + 1);
      last.n += 1;
      last.h = Math.max(last.h, it.h);
    } else rows.push({ y: it.y, n: 1, h: it.h, items: [it] });
  }
  return rows
    .map((r) => {
      r.items.sort((a, b) => a.x - b.x);
      let line = "";
      let end = -Infinity;
      for (const it of r.items) {
        const gap = it.x - end;
        // A wide gap is a column break; a small one is a space between words.
        const sep = line === "" ? "" : gap > Math.max(it.h, 6) * 1.2 ? " | " : gap > Math.max(it.h, 6) * 0.15 ? " " : "";
        line += sep + it.str;
        end = it.x + Math.max(it.w, 0);
      }
      return line.replace(/\s+/g, " ").trim();
    })
    .filter((l) => l.length > 0);
}

// ----------------------------------------------------------------------------------
// Text shapes

const MU = /[\u00b5\u03bc]/g; // micro sign and Greek mu (pdf.js reads one as the other)
const INDIC = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff\u0900-\u0dff]+/g; // and Arabic script (Urdu)
const INDIC_ANY = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff\u0900-\u0dff]/;
// "Sr. Creatinine" is serum, not a title.
const SERUM_ABBR = /\bSr\.?\s+(?=(?:total\s+)?(?:creatinine|uric|urea|bilirubin|albumin|calcium|sodium|potassium|chloride|electrolytes?|proteins?|cholesterol|iron|ferritin|amylase|lipase|phosph\w*|magnesium|globulin|ldh|triglycerides?|vitamin|b12|folate|insulin|cortisol|psa|tsh)\b)/gi;
// Titres ("1:160"), culture reports and antibiograms, and units written in the test name.
const TITRE = /(?:^|[\s|])1\s*:\s*(?:10|20|40|80|160|320|640|1280|2560)(?=[\s|]|$)/;
const ANTIBIOGRAM = /^[A-Z][a-z]+(?:[\s/-][A-Za-z]+){0,3}\s*\|\s*(?:[<>]=?\s*[\d.]+\s*\|\s*)?(?:S|R|I|Sensitive|Resistant|Intermediate|Susceptible)$/;
const CULTURE_WORDS = /\b(salmonella|typhi|paratyphi|widal|organisms?|isolated|growth|clotting\s*time|bleeding\s*time)\b/i;
// "Borderline: 200 - 239" continuing the range of the result above.
const RANGE_LINE = /^[A-Z][A-Za-z /()-]{2,30}\s*:?\s*(?:[<>\u2264\u2265]=?\s*)?\d[\d.]*(?:\s*(?:-|to)\s*\d[\d.]*)?$/;
// Look-alike letters from other scripts ("P\u0430tient" with a Cyrillic a) are read as Latin,
// so no label hides behind them.
const CONFUSABLE: Record<string, string> = {
  "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c", "\u0443": "y", "\u0445": "x", "\u0456": "i", "\u0458": "j", "\u0455": "s",
  "\u0410": "A", "\u0412": "B", "\u0415": "E", "\u041a": "K", "\u041c": "M", "\u041d": "H", "\u041e": "O", "\u0420": "P", "\u0421": "C", "\u0422": "T", "\u0425": "X", "\u0406": "I", "\u0405": "S",
  "\u0391": "A", "\u0392": "B", "\u0395": "E", "\u0396": "Z", "\u0397": "H", "\u0399": "I", "\u039a": "K", "\u039c": "M", "\u039d": "N", "\u039f": "O", "\u03a1": "P", "\u03a4": "T", "\u03a5": "Y", "\u03a7": "X",
  "\u03bf": "o", "\u03b1": "a", "\u03b5": "e", "\u03b9": "i", "\u03ba": "k", "\u03c1": "p", "\u03c4": "t", "\u03c5": "u", "\u03c7": "x",
};
const CONFUSABLE_RE = new RegExp(`[${Object.keys(CONFUSABLE).join("")}]`, "g");
const LETTER_SPACED = /\b(?:[A-Za-z] ){2,}[A-Za-z]\b/g; // "P a t i e n t" -> "Patient"
const NUMBER = /\d/;

const UNIT = [
  "%",
  "(?:g|gm|gms|mg|ug|mcg|ng|pg|iu|miu|uiu|u|mu|kiu|ku|mmol|umol|nmol|pmol|meq|mosm|cells|copies|mill(?:ion)?s?|lakhs?|thou(?:sands?)?)\\s*/\\s*(?:dl|l|ml|ul|kg|24\\s*h(?:rs?)?|day|cumm|cu\\.?\\s*mm|mm3|hpf|lpf|g|hr)",
  "(?:x\\s*)?10\\s*\\^?\\s*[369\\u00b3\\u2076\\u2079]?\\s*/\\s*(?:ul|l|cumm|cu\\.?\\s*mm|mm3)",
  "/\\s*(?:cumm|cu\\.?\\s*mm|ul|hpf|lpf|mm3)",
  "mm\\s*/\\s*(?:hr|1st\\s*hr|h)",
  "ml\\s*/\\s*min(?:\\s*/\\s*1\\.73\\s*m2?)?",
  "kg\\s*/\\s*m2",
  "(?:fl|pg|sec(?:onds)?|secs|ms|bpm|mmhg|cm|mm|kg|ml|mg|g|iu|u|units?|ratio)",
].join("|");
// A value directly followed by its unit, possibly across a column break: "13.4 g/dL", "7.2 | 10^3/uL".
const VALUE_UNIT = new RegExp(`(?:^|[^A-Za-z0-9])[<>]?\\s*\\d[\\d.,]*\\s*(?:\\|\\s*)?(?:${UNIT})(?![A-Za-z])`, "i");
const QUALITATIVE =
  /\b(negative|positive|nil|absent|present|trace|reactive|non[\s-]?reactive|not\s*detected|detected|not\s*seen|seen|normal|abnormal|clear|turbid|hazy|cloudy|pale\s*yellow|yellow|straw|amber|brown|black|green|red|white|clay|acidic|alkaline|neutral|occasional|few|plenty|numerous|adequate|reduced|increased|formed|semi[\s-]*formed|loose|watery|hard|soft|mucoid|normocytic|normochromic|microcytic|hypochromic|macrocytic|anisocytosis|poikilocytosis)\b|(?:^|[\s|])\+{1,4}(?=[\s|]|$)/i;

// Section titles of a lab report (kept so the AI knows a urine glucose from a blood one).
const SECTION =
  /^(complete blood (count|picture)|cbc|ha?emogram|ha?ematology|biochemistry|clinical (pathology|biochemistry)|immunology|immunoassay|serology|endocrinology|hormones?|vitamins?|minerals?|iron (studies|profile)|anemia profile|lipid profile|liver function( tests?)?|lft|kidney function( tests?)?|renal function( tests?)?|kft|rft|thyroid (profile|function( tests?)?)|tft|diabetes( profile)?|glucose|electrolytes?|urine (routine|examination|analysis)( examination)?|urine r\/?m|urinalysis|stool (routine|examination)( examination)?|coagulation( profile)?|cardiac (profile|markers)|inflammatory markers|differential (leu[ck]ocyte )?count|dlc|blood (sugar|glucose)|physical examination|chemical examination|microscopic examination)\b[\s:.-]*(\([^)]{1,30}\))?[\s:.-]*$/i;

// The header row of a results table: short, and at least two of these columns.
const HEADER_WORDS: RegExp[] = [
  /\b(tests?|investigations?|parameters?|examinations?|description|analytes?)\b/i,
  /\b(results?|values?|observed|observations?|findings?)\b/i,
  /\bunits?\b/i,
  /\b(reference|ref\.?|biological|bio\.?|normal|expected)\b.*\b(range|interval|values?|limits?)\b|\brange\b/i,
  /\b(method|methodology|specimen)\b/i,
];

// ----------------------------------------------------------------------------------
// Identity

// A row with any of these is never sent, whatever else it holds.
const IDENTITY = new RegExp(
  [
    // Name labels and people
    "name\\s*[:\\-|.]",
    "\\bname\\b",
    "\\bpt\\.?\\s*(id|no|name|:\\s*[a-z])", // "PT : 13.5 sec" is prothrombin time
    "\\bd\\.?o\\.?b\\b",
    "date of birth",
    "\\bbirth\\b",
    "\\bconsultant\\b",
    "\\bdr\\.\\s*[a-z(]",
    "\\bdr\\s*[:.(]",
    "\\bdr\\s+[a-z]",
    "\\bdoctor\\b",
    "\\b(physician|pathologist|microbiologist|biochemist|radiologist|sonologist|technician|technologist|physiotherapist|dietitian|nurse|incharge|in-charge)\\b",
    "\\b(verified|checked|authori[sz]ed|approved|reported|signed|validated|processed|collected|performed|tested|examined|dictated|typed)\\s*by\\b",
    "\\b(outsourced|processed|performed|tested|done)\\s+(at|to|in)\\b",
    "\\b(m\\.?d|mbbs|dnb|frcp|mrcp|frcpath|dcp|dmrd|dmrt|ms\\s*\\(|phd|mph|bpt|mpt)\\b",
    // IDs
    "\\bpatient'?s?\\s*(name|id|no|number|details|info)\\b",
    "\\buhid\\b",
    "\\bmrn\\b",
    "\\bmrd\\b",
    "\\b(ip|op|opd|ipd|sid|lab|reg(istration)?|sample|barcode|accession|visit|bill|invoice|order|report|ref|episode|bed|ward|uid|mr|token|receipt|case|card|policy|tpa)\\.?\\s*(no|id|number|#)\\b\\.?",
    "\\b(sid|uid)\\s*:",
    "\\bclient\\b",
    "\\blocation\\b",
    "\\bbranch\\b",
    // Contacts and the web
    "\\baddress\\b",
    // "ph" and "cell" only before a phone-length number ("pH 6.0", "Pus Cell 2-3" are results)
    "\\b(mobile|mob|phone|tel|telephone|contact|helpline|whatsapp|fax|appointments?|enquir(y|ies))\\b\\.?\\s*(no\\.?|number|#)?\\s*[:\\-]?\\s*[+(\\d]",
    "\\b(ph|cell)\\b\\.?\\s*(no\\.?|number|#)?\\s*[:\\-]?\\s*[+(]?\\d[\\d\\s()-]{7,}",
    // A sample sent somewhere, and promotions
    "\\b(sent|referred|forwarded|received|dispatched|transferred)\\s+(from|to)\\b",
    "\\b(book(ing)?|offers?|discount|download)\\b|\\bapp\\b|\\d\\s*%\\s*off\\b",
    "\\b(customer\\s*care|helpline|whatsapp|toll[\\s-]*free)\\b",
    "\\bemail\\b",
    "e-mail",
    "www\\.",
    "https?://",
    "\\b[a-z0-9-]+\\.(com|in|org|net|co|care|health|clinic|lab|labs|info|biz|io|app|hospital|doctor|med|me)\\b",
    "\\bsignature\\b",
    "\\baadhaa?r\\b",
    "\\babha\\b",
    "\\bpan\\s*(no|card)\\b",
    "\\bpin\\s*code\\b",
    "\\bpincode\\b",
    "\\bqr\\b",
    "\\bverify\\b",
    // Places: street words in their address forms ("pelvic floor" is a diagnosis, "2nd Floor" an address)
    "\\b(road|rd|street|nagar|layout|apartments?|lane|marg|chowk|taluk|district|village|post\\s*office|cross\\s*road|enclave|towers?|complex|mall|plaza|opp|opposite)\\b",
    "\\bst\\.\\s",
    "\\b\\d+\\s*(st|nd|rd|th)\\s*(floor|fl)\\b|\\b(gr|grd|ground)\\.?\\s*(fl|floor)\\b",
    "\\bflat\\s*(no\\.?)?\\s*\\d|\\b(door|house|plot|shop|survey)\\s*(no\\.?)?\\s*\\d",
    "\\b\\d+(st|nd|rd|th)\\s*(cross|main|block|phase|stage|sector)\\b",
    "(?<!\\d\\s?)\\bsec(tor)?[\\s.-]*\\d", // Not "13.5 sec 11.0 - 14.0"
    "\\b(sco|scf|dlf)\\b",
    "\\b(pvt|ltd|llp|nabl|iso\\s*\\d{4,5})\\b",
    "\\bcr\\.?\\s*no\\b",
    "\\bb\\s*/\\s*o\\b",
    "\\bbaby\\s+of\\b",
  ].join("|"),
  "i",
);

// Institutions, as names: "Sunrise Path Labs", "CITY HOSPITAL" (a lab or clinic points to a
// city). Case-sensitive, so "follow up in clinic" and "lab values" stay.
const INSTITUTION =
  /\b[A-Z][\w&'.-]*\s+(?:[A-Z][\w&'.-]*\s+){0,3}(?:Hospitals?|Clinics?|Centres?|Centers?|Diagnostics?|Laborator(?:y|ies)|Labs?|Healthcare|Health\s*Care|Polyclinic|Nursing\s*Home|Pathology|Imaging|Care)\b|\b(?:HOSPITALS?|CLINICS?|CENTRES?|CENTERS?|DIAGNOSTICS?|LABORATOR(?:Y|IES)|LABS?|HEALTHCARE|POLYCLINIC|PATHOLOGY|IMAGING)\b|\b[A-Z][a-z]+\s+(?:reference\s+|collection\s+|processing\s+)?(?:lab|laboratory|centre|center|branch)\b/; // plurals, and "Thane reference lab"
// Care of, son of, wife of: only before a name (case-sensitive), so "s/o chronic cholecystitis"
// (suggestive of) and "w/o food" (without) stay.
const CARE_OF = /\b[cdswCDSW]\s*\/\s*[oO]\.?\s+(?:Mr|Mrs|Shri|Smt|MR|MRS|SHRI|SMT|[A-Z][a-z]+\s+[A-Z]|[A-Z]{2,}\s+[A-Z]{2,})/;
// Obfuscated emails: "name [at] gmail [dot] com".
const EMAIL_SPELLED = /\S+\s*[[(]\s*at\s*[\])]\s*\S+\s*[[(]\s*dot\s*[\])]\s*\S+/gi;
// MR as an imaging word, not a title: "MR DEFECOGRAPHY".
const MR_IMAGING = /\bMR(?=\s+(?:defecography|angiography|enterography|cholangio\w*|imaging|scan|pelvis|abdomen|brain|spine|venography|arthrography|urography|elastography|fistulogram)\b)/gi;

// Softer checks: these words also appear in results ("Ref: 13-17", "Age 20-49: ...",
// "Prothrombin time (Patient)"), so a row with a known test and a value is exempt.
const IDENTITY_SOFT = new RegExp(
  [
    "\\bpatient'?s?\\s*(name|id|no|number|details|info|:)",
    "patientname",
    "\\bref(erred|\\.)?\\s*(by|dr)\\b",
    "\\bref\\s*[:.](?!\\s*[:.]?\\s*(?:[<>\u2264\u2265]?\\s*\\d|range|interval|values?|limits?))", // "Ref: < 125" and "Ref. Range" are about ranges
    "\\breferr(al|ing)\\b",
    "\\bage\\b\\s*(\\(|[:/]|\\d(?!\\d*\\s*-\\s*\\d))", // "Age 31-35: 115 - 307" is a range
    "\\bgender\\b",
    "\\bsex\\s*[:/]",
    "/\\s*sex\\b",
  ].join("|"),
  "i",
);

// Titles before a name. Case-sensitive, so "ms" (milliseconds) and "mg" stay.
const TITLES = "Mr|Mrs|Ms|Miss|Mstr|Mast|Master|Baby|Smt|Shri|Sri|Sh|Kum|Kumari|Km|Tmt|Thiru|Selvi|Mohd|Er|Sr|Dr|Prof|MR|MRS|MS|MISS|MASTER|MAST|BABY|SMT|SHRI|SRI|SH|KUM|KUMARI|TMT|THIRU|MOHD|DR|PROF";
const HONORIFIC = new RegExp(`\\b(${TITLES})\\b\\.?\\s*(\\(\\s*(${TITLES})\\.?\\s*\\)\\s*)?[A-Z]`);
// An explicit title before a lower-case name ("Kum. anita").
const HONORIFIC_LOWER = /\b(?:Kum|Km|Smt|Shri|Sri|Kumari|Mr|Mrs|Ms|Miss|Master|Baby|Tmt|Thiru)\.\s*[a-z]{3,}/;
// A 6-digit PIN code. Platelet counts have 6 digits too, so rows naming a test are exempt.
const PIN = /\b[1-9]\d{5}\b/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const DOMAIN = /\b[a-z0-9-]+\.(com|in|org|net|co|care|health|clinic|lab|labs|info|biz|io|app|hospital|doctor|med|me)\b(\/\S*)?/gi;
const CODE_CANDIDATE = /\b[A-Za-z0-9][A-Za-z0-9/-]{6,}[A-Za-z0-9]\b/g;
const LONG_NUMBER = /\b\d{8,}\b/g;
// Unambiguous ages, removed everywhere; the short forms ("34 M") only outside result rows,
// where "17.0 M, 12.0 - 15.5 F" is a reference range for men and women.
// Not inside a range ("40-49 yrs", "> 18 years").
const AGE_LONG =
  /(?<![-<>]\s?)\b\d{1,3}\s*(?:years?|yrs?\.?|yo)\b(?:\s*\d{1,2}\s*(?:months?|mths?|mo|m)\b)?|\b\d{1,3}\s*-?\s*(?:years?|yrs?)[\s-]*old\b|\baged\s+\d{1,3}\b|\b(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-]+(?:one|two|three|four|five|six|seven|eight|nine))?[\s-]+(?:years?|yrs?)[\s-]*old\b/gi;
// "Age: 34 yrs" in free text. Not on result rows, where "Age 20-49: 250 - 900" is a range.
const AGE_LABELLED = /\(?\s*\bage\s*[:\-]?\s*\d{1,3}(?!\d)\s*(?:y|yrs?|years?)?\.?\s*\)?(?!\s*-\s*\d)/gi;
// Never part of a decimal ("1.4 M", "Male 0.2 - 1.4").
const AGE_SHORT = /\b\d{1,3}\s*y\b(?:\s*\d{1,2}\s*m\b)?|(?<![\d.])\b\d{1,3}\s*[mf]\b|\b[mf]\s*\/\s*\d{1,3}\b(?![.\d])|(?<![\d.])\b\d{1,3}\s*\/\s*[mf]\b|(?<![\d.])\b\d{1,3}\s*,?\s*(?:male|female)\b|\b(?:male|female)\s*,?\s*\d{1,3}\b(?![.\d])|\b[mf]\s+\d{1,3}\b(?![.\d])/gi;
const REPORT_DATE_WORD = /\b(collect|report|sampl|receiv|regist)\w*/i;
const DATE_ALL = /\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\s-]+[A-Za-z]{3,9}[\s-]+\d{4})\b/g;
const DATE = /\b(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\s-]+[A-Za-z]{3,9}[\s-]+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})\b/;

// Words that may follow a result's range (flags and interpretations); anything else trailing
// in capitals is a signature or a name and is cut off.
const AFTER_RANGE = /^(h|l|hh|ll|high|low|normal|abnormal|borderline|critical|desirable|optimal|near|deficient|deficiency|insufficient|insufficiency|sufficient|prediabetes|pre-diabetic|diabetes|diabetic|non-diabetic|reactive|non-reactive|positive|negative|elevated|decreased|increased|euthyroid|adequate|m|f|male|female|men|women|adults?|children|s|r|i|sensitive|resistant|intermediate|susceptible)$/i;

// Clinical sections of a consultation, prescription or scan report that may be sent.
const ALLOWED_SECTION =
  /^\s*(diagnosis|provisional diagnosis|final diagnosis|clinical diagnosis|dx|impression|imp|findings?|observations?|advice|advised|adv|plan|recommendations?|conclusion|opinion|assessment|rx|medications?|medicines|treatment|follow[\s-]*up|f\s*\/\s*u|investigations?(\s*advised)?|diet(\s*advice)?|instructions)\b\s*[:.-]?\s*/i;
// The study a scan report is about ("MR DEFECOGRAPHY", "USG ABDOMEN AND PELVIS").
const STUDY_TITLE = /^(mr|mri|ct|hrct|cect|ncct|usg|ultrasound|sonography|x-?ray|echo(cardiography)?|ecg|eeg|doppler|mammography|defecography|manometry|colonoscopy|endoscopy|sigmoidoscopy|barium)\b[\w\s&/(),.-]{0,60}$/i;
// Sections that tell the person's story: they may name or describe the person. Never sent.
const CLOSED_SECTION = /^\s*(patient|history|chief complaints?|complaints?|presenting|c\s*\/\s*o|examination|vitals|personal|family|social|address|contact|billing|consultant|doctor|referred|demographics)\b/i;
const MEDICINE_INLINE = /\b(tab|tablet|cap|capsule|syp|syr|syrup|inj|injection|oint|ointment|gel|cream|sachet|pwd|powder|drops?|susp|suspension|soln|solution|lotion|granules|spray|inhaler|enema|suppository)\b\.?\s+[A-Z0-9]/i;
const DOSE_STRICT = /\b\d+(\.\d+)?\s*(mg|mcg|ug|g|ml|iu|units?|tsp|tbsp)\b/i;

// ----------------------------------------------------------------------------------
// Names found in the document, removed everywhere else they appear.

// Labels of panels and tests, not people ("Test Name : URINE ROUTINE").
const NOT_PERSON_LABEL = /\b(test|package|panel|profile|investigation|sample|specimen|department|dept|service|scheme|plan|item|product|drug|medicine|brand|company|insurance|tpa|hospital|lab|clinic|centre|center)\s*name\b/gi;
const NAME_FIELD =
  /(?:name|patient|\bpt\.?|consultant|pathologist|radiologist|physician|doctor|verified\s*by|checked\s*by|signed\s*by|reported\s*by|referred\s*by|ref\.?\s*by|ref\.?\s*dr\.?)\s*(?:of\s*(?:the\s*)?patient\s*)?[:\-|.]+\s*((?:(?:mr|mrs|ms|miss|master|baby|smt|shri|sri|sh|kum|kumari|tmt|thiru|dr)\.?\s*)?[A-Za-z][A-Za-z.' ]{1,60})/gi;
// "Patient Name Rahul Sharma" (no colon): capitalised words right after "Name". Case-sensitive.
const NAME_SPACE = /\b(?:[Nn]ame|NAME)\s+((?:[A-Z][A-Za-z'.]+\s*){1,4})/g;
const TITLED = new RegExp(`\\b(?:${TITLES})\\b\\.?\\s*(?:\\(\\s*(?:${TITLES})\\.?\\s*\\)\\s*)?((?:[A-Z]\\.?\\s*){0,2}[A-Z][A-Za-z'.]+(?:\\s+[A-Z][A-Za-z'.]+){0,3})`, "g");
const OF_PERSON = /\b(?:[bB]\s*\/\s*[oO]|[bB]aby\s+of|BABY\s+OF|[cdswCDSW]\s*\/\s*[oO])\.?\s*((?:[A-Z][A-Za-z'.]+\s*){1,4})/g;
// Capitalised words just before an age: "Arjun Mehta | 41 Y / Male", "Rahul, 34M".
const BEFORE_AGE = /((?:[A-Z][A-Za-z'.]+\s+){0,3}[A-Z][A-Za-z'.]+)\s*[,|(]?\s*(?:\|\s*)?\d{1,3}\s*(?:[yY]\b|[yY][rR][sS]?\b|[yY]ears?\b|YEARS?\b|[yY][oO]\b|[mfMF]\b|\/\s*[mfMF]\b|-?\s*[yY]ear)/g;
const NOT_A_NAME =
  /^(mr|mrs|ms|miss|master|mast|baby|smt|shri|sri|sh|kum|kumari|tmt|thiru|selvi|mohd|er|sr|dr|prof|the|and|age|sex|male|female|years?|yrs?|self|patient|name|ref|by|of|on|no|id|date|test|report|sample|lab|for|with|from|to|at|in|md|mbbs|dnb|pathology|consultant|sir|madam|urine|stool|routine|profile|panel|package|vitamin|vitamins|blood|serum|plasma|total|free|fasting|random|complete|count|examination|culture|sensitivity|lipid|liver|kidney|renal|thyroid|function|iron|studies|sugar|glucose|cbc|hb|whole|tests?|results?|value|unit|units|range|reference|interval|biological|investigation|description|observed|method|specimen|collected|reported|received|registered|printed|page|end|note|remarks?|comments?|impression|diagnosis|advice|findings|history|status|type|category|direct|walk|walkin|camp|corporate|home|collection|outside|others?|none)$/i;

function namesIn(rows: string[]): { names: string[]; testLike: string[] } {
  const words = new Set<string>();
  const testLike = new Set<string>();
  const add = (phrase: string | undefined, labelled = false) => {
    const cut = (phrase ?? "").split(/\s\|\s|\s{2,}|\b(?:age|sex|gender|dob|uhid|mrn|id|ref|date|lab|sample|reg|collected|reported|years?|yrs?|mobile|phone|contact)\b|\d/i)[0] ?? "";
    for (const w of cut.split(/[\s.,]+/)) {
      const t = w.replace(/[^A-Za-z']/g, "");
      if (t.length < 3 || NOT_A_NAME.test(t)) continue;
      if (!mentionsTest(t)) words.add(t);
      // A name that is also a test ("ANA"): only from an explicit "Name:" label, and removed
      // only outside result rows, so the ANA test itself stays.
      else if (labelled) testLike.add(t);
    }
  };
  rows.forEach((raw, i) => {
    const row = raw.replace(MR_IMAGING, "MRI").replace(NOT_PERSON_LABEL, " ").replace(/\b(?:pt|patient)'?s?\s*\.?\s*name\b/gi, "Name");
    for (const m of row.matchAll(NAME_FIELD)) add(m[1], true);
    for (const m of row.matchAll(NAME_SPACE)) add(m[1]);
    for (const m of row.matchAll(TITLED)) add(m[1]);
    for (const m of row.matchAll(OF_PERSON)) add(m[1]);
    for (const m of row.matchAll(BEFORE_AGE)) add(m[1]);
    // A label on its own row ("Patient Name :"): the name is on the next row.
    if (/^(patient'?s?\s*)?name\s*(of\s*(the\s*)?patient\s*)?[:\-.]?\s*$/i.test(row.trim()) && rows[i + 1]) add(rows[i + 1].split(" | ")[0]);
  });
  return { names: [...words], testLike: [...testLike] };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ----------------------------------------------------------------------------------
// Scrubbing what is kept

const VALUE_UNIT_ALL = new RegExp(`[<>]?\\d[\\d.,]*\\s*(?:\\|\\s*)?(?:${UNIT})(?![A-Za-z])`, "gi");
const VALUE_WITH_UNIT_TOKEN = new RegExp(`^[<>]?\\d[\\d.,]*\\s*(?:${UNIT})$`, "i");
// "Intact PTH (pg/mL) | 45 | 15 - 65"
const UNIT_IN_NAME = new RegExp(`\\((?:${UNIT})\\)\\s*\\|\\s*[<>]?\\s*\\d`, "i");

/** Phone numbers (8 to 13 digits in groups), but not reference ranges like "150000 - 410000". */
function scrubPhones(row: string): string {
  return row.replace(/\+?\(?\d[\d\s().-]{6,}\d/g, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 13) return m;
    // A value and its range, or several values ("1.10 0.80 - 1.20", "7200 4000 - 11000").
    if (!/^\+|^\(?0\d/.test(m.trim()) && (/\d\.\d+\s/.test(m) || /^\d[\d.,]*\s+\d[\d.,]*\s*-\s*\d[\d.,]*$/.test(m.trim()))) return m;
    const range = m.match(/^\s*(\d[\d.,]*)\s*(?:-|to)\s*(\d[\d.,]*)\s*$/);
    if (range) {
      const [a, b] = [range[1].replace(/\D/g, ""), range[2].replace(/\D/g, "")];
      // "98765-43210" is a mobile number; "150000 - 410000" a range.
      const mobile = a.length === 5 && b.length === 5 && /^[6-9]/.test(a) && !/\s/.test(m);
      // "0253-2345678" (STD code) and "1800-1234567" (toll-free) are phones.
      const landline = /^0\d/.test(range[1]) || (/^18[06]0$/.test(range[1]) && !/\s/.test(m));
      if (!mobile && !landline && a.length <= 7 && b.length <= 7) return m;
    }
    return " ";
  });
}

/** Sample ids and barcodes: long tokens mixing at least 3 digits and 2 letters. Not "126mg/dL", not "Dolo-650". */
function isCode(token: string): boolean {
  if (VALUE_WITH_UNIT_TOKEN.test(token.replace(MU, "u"))) return false;
  if (/^[A-Za-z]+-\d{2,4}$/.test(token)) return false;
  return (token.match(/\d/g)?.length ?? 0) >= 3 && (token.match(/[A-Za-z]/g)?.length ?? 0) >= 2;
}

/** Cuts a signature or a call-out ("informed to Sr. X") trailing a result row. */
function trimTrailing(row: string): string {
  // "informed telephonically to ...", "conveyed over phone to ..."
  let out = row.replace(/\s*[-,;]?\s*\b(?:critical\s+value\s+)?(?:informed|intimated|communicated|conveyed|notified)\b.*$/i, "");
  const m = out.match(/^(.*?[\d)%])\s+((?:[A-Z][A-Za-z.'-]*\s*){1,4})$/);
  // "HIV 1 & 2 Antibody Non Reactive" ends in a result, not a signature.
  if (m && !QUALITATIVE.test(m[2]) && !m[2].trim().split(/\s+/).every((w) => AFTER_RANGE.test(w.replace(/\.$/, "")))) out = m[1];
  // A signature or stamp in its own cell after the range ("30 - 400 | PRIYA NAIR").
  const t = out.match(/^(.*\d\s*(?:-|to)\s*[\d.]+|.*[<>]=?\s*[\d.]+)\s*\|\s*([A-Z][A-Za-z.:' ]*)$/);
  if (t && !QUALITATIVE.test(t[2]) && !t[2].trim().split(/\s+/).every((w) => AFTER_RANGE.test(w.replace(/[.:]$/, "")))) out = t[1];
  return out;
}

function reportDate(row: string): string | null {
  const word = row.match(REPORT_DATE_WORD);
  if (!word || word.index === undefined) return null;
  // The date after the keyword ("DOB 15/08/1990 | Collected On 12/10/2026" gives the second).
  const after = row.slice(word.index).match(DATE);
  return after ? after[0] : null;
}

// ----------------------------------------------------------------------------------

type RowKind = "section" | "strong" | "weak" | "none";

function classify(row: string): RowKind {
  if (SECTION.test(row)) return "section";
  const p = row.replace(MU, "u");
  if ((mentionsTest(p) || CULTURE_WORDS.test(p)) && (NUMBER.test(p) || QUALITATIVE.test(p) || row.includes(" | "))) return "strong";
  if (VALUE_UNIT.test(p) || TITRE.test(p) || ANTIBIOGRAM.test(p) || UNIT_IN_NAME.test(p)) return "weak";
  return "none";
}

function isTableHeader(row: string): boolean {
  const plain = row.replace(DATE_ALL, " ");
  const words = plain.split(/\s+/).length;
  const cells = row.split(" | ").length;
  return HEADER_WORDS.filter((re) => re.test(plain)).length >= 2 && (cells >= 3 || words <= 6) && !NUMBER.test(plain.replace(/\b(1st|2nd)\b/gi, ""));
}

/** A results header whose columns are dates (current and earlier results): it says which value is which. */
function isDatedHeader(row: string): boolean {
  return isTableHeader(row) && DATE.test(row) && !IDENTITY.test(row) && !IDENTITY_SOFT.test(row);
}

/** A row that is only a test name (no value): it may belong to a value on the next row. */
function nameOnly(row: string | undefined): boolean {
  return !!row && !/(?:^|[\s|(])[<>]?\d[\d.,]*(?=$|[\s|),%])/.test(row) && row.split(/\s+/).length <= 6 && /^[A-Z(]/.test(row) && !IDENTITY.test(row) && !HONORIFIC.test(row) && !IDENTITY_SOFT.test(row);
}

/**
 * Redacts a document given as pages of rows. Blood reports keep result rows only; other
 * kinds (sent only after the person's OK) also keep their clinical sections and medicine
 * lines, at most 8 lines per section, ending early at a footer-like line.
 */
export function redactPages(pages: string[][], kind: DocKind = "blood_report", maxChars = 12_000): Redacted {
  const clean = pages.map((page) =>
    page
      .map((r) => r.normalize("NFC").replace(CONFUSABLE_RE, (c) => CONFUSABLE[c]).replace(/\s+/g, " ").replace(LETTER_SPACED, (m) => m.replace(/ /g, "")).replace(SERUM_ABBR, "Serum ").replace(/[\u2010-\u2015]/g, "-").trim())
      .filter(Boolean),
  );
  const { names, testLike } = namesIn(clean.flat());
  const nameRe = names.length ? new RegExp(`\\b(${names.map(escapeRe).join("|")})\\b`, "gi") : null;
  const testLikeRe = testLike.length ? new RegExp(`\\b(${testLike.map(escapeRe).join("|")})\\b`, "gi") : null;
  const out: string[] = [];
  let dropped = 0;
  let dateKept = false;
  const prose = kind !== "blood_report";

  for (const page of clean) {
    const header = page.findIndex(isTableHeader);
    let section = { allowed: false, left: 0 };
    let lastKept = -2;
    for (let index = 0; index < page.length; index++) {
      let row = page[index];
      // "Test | 12/10/2026 | 15/04/2026 | Unit | Range": keeps which column is the current result.
      if (!prose && isDatedHeader(row)) {
        out.push(row);
        continue;
      }
      if (REPORT_DATE_WORD.test(row) && DATE.test(row)) {
        const date = reportDate(row);
        if (date && !dateKept) {
          out.push(`Report date: ${date}`);
          dateKept = true;
        }
        dropped++;
        continue;
      }
      // Indian-script text on a row is a label or a name: it never goes.
      if (INDIC_ANY.test(row)) row = row.replace(INDIC, " ").replace(/\s+/g, " ").trim();

      let rowKind = classify(row);
      // A "Label: range" line right under a kept result continues its range.
      if (!prose && rowKind === "none" && lastKept === index - 1 && RANGE_LINE.test(row)) rowKind = "weak";
      // A value whose test name wrapped onto the rows around it ("Glycosylated Haemoglobin" /
      // "5.9 | % | 4.0 - 5.6" / "(HbA1c)"): join them back into one row.
      // "8 | NT-proBNP | 85 | ..." already has its name; never glue the row above onto it.
      if (rowKind === "weak" && /^[<>\d]/.test(row) && !/^\d{1,3}\.?\s*\|\s*[A-Za-z][^|]*\|\s*[<>]?\d/.test(row)) {
        const above = page[index - 1];
        const below = page[index + 1];
        const before = nameOnly(above) && classify(above) === "none" ? `${above} ` : "";
        const after = below && /^\(/.test(below) && nameOnly(below) ? `${below} ` : "";
        if (before || after) {
          row = `${before}${after}${row}`.replace(/\s+/g, " ").trim();
          if (after) index++;
          rowKind = classify(row);
        }
      }

      const aboveHeader = header > 0 && index < header;
      // Above the results header (or on a page without one), a row is a result only
      // if its first cell names the test; "Age / Sex : 34 Y | Sample Type : Whole Blood" is not.
      if (!prose && rowKind === "strong" && (aboveHeader || header < 0)) {
        const first = row.split(" | ").find((c) => !/^\d{1,3}\.?$/.test(c.trim())) ?? "";
        if (!mentionsTest(first.replace(MU, "u").replace(/\b(?:whole\s+|edta\s+)?blood\b/gi, " "))) rowKind = VALUE_UNIT.test(row.replace(MU, "u")) ? "weak" : "none";
      }
      let keep = rowKind === "section" || rowKind === "strong" || (rowKind === "weak" && !aboveHeader);
      if (prose) {
        if (ALLOWED_SECTION.test(row)) section = { allowed: true, left: 8 };
        else if (CLOSED_SECTION.test(row)) section = { allowed: false, left: 0 };
        // A line with no lower-case word (a letterhead, a signature, an address) ends a section.
        else if (section.allowed && rowKind === "none" && !/(^|\s)[a-z]/.test(row.replace(/\b(and|of|the|to|with|for|in|at|on|by)\b/g, "X"))) section = { allowed: false, left: 0 };
        if (section.allowed && section.left > 0) {
          keep = true;
          section.left--;
        }
        if (kind === "prescription" && (MEDICINE_INLINE.test(row) || DOSE_STRICT.test(row))) keep = true;
        if (kind === "scan" && STUDY_TITLE.test(row)) keep = true;
      }
      // Prescriptions: a medicine line keeps only the medicine ("Arjun Mehta | Tab. X" -> "Tab. X").
      if (kind === "prescription") {
        const at = row.search(MEDICINE_INLINE);
        if (at > 0) row = row.slice(at);
      }
      if (prose && rowKind !== "strong") row = row.replace(AGE_LABELLED, " ").replace(AGE_LONG, " ").replace(/\s+/g, " ").trim();
      const checked = row.replace(MR_IMAGING, "MRI");
      const soft = rowKind !== "strong" && IDENTITY_SOFT.test(checked);
      // A 6-digit count with its unit ("250000 /uL") is not a PIN code.
      const pin = rowKind !== "strong" && rowKind !== "section" && PIN.test(row.replace(MU, "u").replace(VALUE_UNIT_ALL, " "));
      const phoneLabel = /\b(ph(one)?|cell|mob(ile)?)\b\.?\s*[:\-]?\s*\+?\(?\d[\d\s()-]{7,}/i.test(row);
      if (!keep || IDENTITY.test(checked) || HONORIFIC.test(checked) || HONORIFIC_LOWER.test(checked) || INSTITUTION.test(checked) || CARE_OF.test(checked) || soft || pin || phoneLabel) {
        dropped++;
        continue;
      }
      if (rowKind === "strong" || rowKind === "weak") row = trimTrailing(row);
      let text = scrubPhones(row.replace(EMAIL_SPELLED, " ").replace(EMAIL, " ").replace(DOMAIN, " "))
        .replace(CODE_CANDIDATE, (t) => (isCode(t) ? " " : t))
        .replace(LONG_NUMBER, " ");
      if (rowKind !== "strong") text = text.replace(AGE_LABELLED, " ");
      text = text.replace(AGE_LONG, " ");
      if (rowKind !== "strong") text = text.replace(AGE_SHORT, " ");
      if (nameRe) text = text.replace(nameRe, " ");
      if (testLikeRe && rowKind !== "strong" && rowKind !== "section") text = text.replace(testLikeRe, " ");
      text = text
        .replace(/(\s\|\s*)+/g, " | ")
        .replace(/^\s*\|\s*|\s*\|\s*$/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (text.replace(/[^A-Za-z0-9]/g, "").length < 3) {
        dropped++;
        continue;
      }
      out.push(text);
      if (rowKind === "strong" || rowKind === "weak") lastKept = index;
    }
  }
  let text = out.join("\n");
  if (text.length > maxChars) text = text.slice(0, text.lastIndexOf("\n", maxChars) > 0 ? text.lastIndexOf("\n", maxChars) : maxChars);
  return { text, kept: out.length, dropped };
}

/** Redacts plain text (one line per row, one page). */
export function redactForAi(raw: string, kind: DocKind = "blood_report", maxChars = 12_000): Redacted {
  return redactPages([raw.split(/\r?\n/)], kind, maxChars);
}
