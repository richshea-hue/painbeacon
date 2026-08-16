/**
 * American-English gate.
 *
 * These are US sites for a US audience, and the spellings had drifted British
 * far enough to reach user-facing text — a social-card legend reading "This
 * centre", JSON-LD reading "In vitro fertilisation", a map saying "isn't a
 * recognised ZIP". A note in a doc did not stop it recurring, so it is now
 * mechanical.
 *
 * The same file lives in the primary-source and painbeacon repos. Keep them
 * identical: a rule learned in one is a rule the other needs.
 *
 *   node scripts/us-english.mjs [path ...]     scan, exit 1 on any hit
 *   node scripts/us-english.mjs --fix [path]   rewrite in place
 *
 * Runs before `astro build` on both sites, so a British spelling cannot ship.
 *
 * WHOLE WORDS ONLY, from an explicit list. The tempting shortcut is a prefix
 * rule like /\bcharacteris/ -> "characteriz", and it is wrong: it turns
 * "characteristics" into "characteriztics" and "realistic" into "realiztic".
 * Both happened on the first hand-run pass. A gate that reports false hits gets
 * switched off, so every entry here is a complete word with a complete
 * replacement, and words that are correct in BOTH dialects (advertise,
 * exercise, compromise, supervise, analysis, practice-the-noun) are absent by
 * construction rather than by exception.
 *
 * Escape hatch: put `us-english-ok` in a comment on the line. Real proper nouns
 * exist — "Rockville Centre", "Grey" as a surname — and the gate must not force
 * a misspelling of somebody's name.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* Directories whose contents are not ours to spell.
 * `data` matters most: the normalized CMS and NPPES output carries real
 * addresses — "680 CENTRE ST", "ROCKVILLE CENTRE" — which are proper nouns.
 * `dist` is generated from files we already scan, so flagging it would report
 * every hit twice and point at the wrong copy. */
const SKIP_DIRS = new Set([
  "node_modules", "dist", ".astro", ".git", ".wrangler", "data", "vendor",
  ".cache", "__pycache__",
]);
/* The gate's own word list is, necessarily, a list of British spellings. */
const SKIP_FILES = new Set(["package-lock.json", "us-english.mjs"]);
const EXT = new Set([".md", ".mjs", ".js", ".ts", ".astro", ".json", ".txt", ".css", ".html", ".yml", ".yaml", ".py"]);
const ESCAPE = "us-english-ok";

/** stem + the suffixes that actually occur, so the list stays whole-word. */
const ise = (stem) => [
  [`${stem}ise`, `${stem}ize`], [`${stem}ises`, `${stem}izes`],
  [`${stem}ised`, `${stem}ized`], [`${stem}ising`, `${stem}izing`],
  [`${stem}isation`, `${stem}ization`], [`${stem}isations`, `${stem}izations`],
];
const our = (stem) => [
  [`${stem}our`, `${stem}or`], [`${stem}ours`, `${stem}ors`],
  [`${stem}oured`, `${stem}ored`], [`${stem}ouring`, `${stem}oring`],
];

const PAIRS = [
  // -our -> -or
  ...our("col"), ["colourful", "colorful"], ["colourless", "colorless"],
  ["colourblind", "colorblind"], ["colourblindness", "colorblindness"],
  ["truecolour", "truecolor"],
  ...our("behavi"), ["behavioural", "behavioral"], ["behaviourally", "behaviorally"],
  ...our("fav"), ["favourite", "favorite"], ["favourites", "favorites"],
  ["favourable", "favorable"], ["favourably", "favorably"],
  ...our("hon"), ["honourable", "honorable"], ["honourably", "honorably"],
  ...our("lab"), ...our("flav"), ...our("hum"), ...our("rum"), ...our("vap"),
  ...our("od"), ...our("tum"), ...our("end"), ["endeavour", "endeavor"],
  ["neighbour", "neighbor"], ["neighbours", "neighbors"],
  ["neighbouring", "neighboring"], ["neighbourhood", "neighborhood"],
  ["armour", "armor"], ["armoured", "armored"],
  ["harbour", "harbor"], ["parlour", "parlor"], ["saviour", "savior"],
  ["splendour", "splendor"], ["vigour", "vigor"], ["clamour", "clamor"],
  ["glamour", "glamor"], ["rigour", "rigor"], ["rigours", "rigors"],

  // -re -> -er
  ["centre", "center"], ["centres", "centers"], ["centred", "centered"],
  ["centring", "centering"], ["epicentre", "epicenter"],
  ["metre", "meter"], ["metres", "meters"], ["litre", "liter"], ["litres", "liters"],
  ["fibre", "fiber"], ["fibres", "fibers"], ["theatre", "theater"],
  ["theatres", "theaters"], ["calibre", "caliber"], ["sombre", "somber"],
  ["spectre", "specter"], ["lustre", "luster"], ["manoeuvre", "maneuver"],

  // -ise / -isation -> -ize / -ization
  ...ise("organ"), ["organisational", "organizational"],
  ...ise("recogn"), ["recognisable", "recognizable"], ["recognisably", "recognizably"],
  ...ise("real"), ...ise("normal"), ...ise("standard"), ...ise("personal"),
  ...ise("summar"), ...ise("emphas"), ...ise("de-emphas"), ...ise("minim"),
  ...ise("maxim"), ...ise("optim"), ...ise("priorit"), ...ise("special"),
  ...ise("util"), ...ise("apolog"), ...ise("categor"), ...ise("character"),
  ...ise("raster"), ...ise("visual"), ...ise("fertil"), ...ise("steril"),
  ...ise("final"), ...ise("formal"), ...ise("monet"), ...ise("critic"),
  ...ise("modern"), ...ise("legal"), ...ise("author"), ...ise("central"),
  ...ise("random"), ...ise("synchron"), ...ise("editorial"), ...ise("initial"),
  ...ise("serial"), ...ise("stabil"), ...ise("familiar"), ...ise("popular"),
  ...ise("neutral"), ...ise("general"), ...ise("digit"), ...ise("custom"),
  /* "analyses" is NOT here. It is both the British verb and the correct
   * American plural of "analysis" — PainBeacon's research index opens with
   * "Original analyses of pain management access", which is right as written.
   * The other three forms are unambiguous. */
  ["analyse", "analyze"], ["analysed", "analyzed"], ["analysing", "analyzing"],
  ["paralyse", "paralyze"], ["paralysed", "paralyzed"],
  ["catalyse", "catalyze"], ["catalysed", "catalyzed"],

  // -ce noun / -se verb
  ["licence", "license"], ["licences", "licenses"], ["licenced", "licensed"],
  ["defence", "defense"], ["defences", "defenses"],
  ["offence", "offense"], ["offences", "offenses"],
  ["pretence", "pretense"],
  ["practise", "practice"], ["practises", "practices"],
  ["practised", "practiced"], ["practising", "practicing"],

  // doubled consonant before a suffix
  ["labelled", "labeled"], ["labelling", "labeling"],
  ["travelled", "traveled"], ["travelling", "traveling"],
  ["traveller", "traveler"], ["travellers", "travelers"],
  ["cancelled", "canceled"], ["cancelling", "canceling"],
  ["modelled", "modeled"], ["modelling", "modeling"],
  ["fuelled", "fueled"], ["fuelling", "fueling"],
  ["signalled", "signaled"], ["signalling", "signaling"],
  ["levelled", "leveled"], ["levelling", "leveling"],
  ["totalled", "totaled"], ["totalling", "totaling"],
  ["counselled", "counseled"], ["counselling", "counseling"],
  ["counsellor", "counselor"], ["counsellors", "counselors"],
  ["marvelled", "marveled"], ["jewellery", "jewelry"],
  ["enrolment", "enrollment"], ["instalment", "installment"],
  ["fulfil", "fulfill"], ["fulfils", "fulfills"], ["fulfilment", "fulfillment"],
  ["skilful", "skillful"], ["wilful", "willful"],

  // medical — the ones that matter most on these sites
  ["foetus", "fetus"], ["foetal", "fetal"], ["foetuses", "fetuses"],
  ["oestrogen", "estrogen"], ["oestrogens", "estrogens"],
  ["oestradiol", "estradiol"], ["oestrous", "estrous"],
  ["gynaecology", "gynecology"], ["gynaecological", "gynecological"],
  ["gynaecologist", "gynecologist"], ["gynaecologists", "gynecologists"],
  ["paediatric", "pediatric"], ["paediatrics", "pediatrics"],
  ["paediatrician", "pediatrician"], ["paediatricians", "pediatricians"],
  ["orthopaedic", "orthopedic"], ["orthopaedics", "orthopedics"],
  ["anaesthesia", "anesthesia"], ["anaesthetic", "anesthetic"],
  ["anaesthetics", "anesthetics"], ["anaesthetist", "anesthetist"],
  ["anaesthesiologist", "anesthesiologist"], ["anaesthesiology", "anesthesiology"],
  ["haematology", "hematology"], ["haematologist", "hematologist"],
  ["haemorrhage", "hemorrhage"], ["haemorrhagic", "hemorrhagic"],
  ["haemoglobin", "hemoglobin"], ["haemodynamic", "hemodynamic"],
  ["anaemia", "anemia"], ["anaemic", "anemic"],
  ["leukaemia", "leukemia"], ["ischaemia", "ischemia"], ["ischaemic", "ischemic"],
  ["oedema", "edema"], ["oedematous", "edematous"],
  ["diarrhoea", "diarrhea"], ["caesarean", "cesarean"], ["caesarian", "cesarean"],
  ["dyspnoea", "dyspnea"], ["apnoea", "apnea"], ["oesophagus", "esophagus"],
  ["oesophageal", "esophageal"], ["coeliac", "celiac"], ["orthopaedist", "orthopedist"],

  // misc
  ["grey", "gray"], ["greys", "grays"], ["greyish", "grayish"],
  ["greyscale", "grayscale"], ["catalogue", "catalog"], ["catalogues", "catalogs"],
  ["dialogue", "dialog"], ["dialogues", "dialogs"], ["analogue", "analog"],
  ["whilst", "while"], ["amongst", "among"],
  ["storey", "story"], ["storeys", "stories"],
  ["programme", "program"], ["programmes", "programs"],
  ["sceptic", "skeptic"], ["sceptical", "skeptical"], ["scepticism", "skepticism"],
  ["mould", "mold"], ["moulds", "molds"], ["moulded", "molded"],
  ["cheque", "check"], ["cheques", "checks"], ["tyre", "tire"], ["tyres", "tires"],
  ["aluminium", "aluminum"], ["draught", "draft"], ["kerb", "curb"],
  ["cosy", "cozy"], ["sulphur", "sulfur"], ["aeroplane", "airplane"],
].filter(([a, b]) => a !== b);

/* "towards", "amidst" and "learnt" are deliberately absent: they are informal
 * in American English rather than wrong, and a gate that argues about them
 * teaches people to bypass it. */

const MAP = new Map(PAIRS.map(([a, b]) => [a.toLowerCase(), b]));
const WORD = new RegExp(`\\b(${PAIRS.map(([a]) => a).sort((x, y) => y.length - x.length).join("|")})\\b`, "gi");

/** Preserve the case the author used: Colour -> Color, COLOUR -> COLOR. */
function matchCase(found, replacement) {
  if (found === found.toUpperCase() && found !== found.toLowerCase()) return replacement.toUpperCase();
  if (found[0] === found[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

const argv = process.argv.slice(2);
const FIX = argv.includes("--fix");
const targets = argv.filter((a) => !a.startsWith("--"));
const roots = (targets.length ? targets : [ROOT]).map((t) => path.resolve(t));

const hits = [];
let fixedCount = 0, scanned = 0;

function scanFile(file) {
  const src = fs.readFileSync(file, "utf8");
  if (!WORD.test(src)) { WORD.lastIndex = 0; return; }
  WORD.lastIndex = 0;
  scanned++;

  const lines = src.split(/\r?\n/);
  let changed = false;
  lines.forEach((line, i) => {
    if (line.includes(ESCAPE)) return;
    const out = line.replace(WORD, (found, _g, offset) => {
      const fix = matchCase(found, MAP.get(found.toLowerCase()));
      hits.push({ file, line: i + 1, col: offset + 1, found, fix });
      return fix;
    });
    if (out !== line) { lines[i] = out; changed = true; }
  });

  if (FIX && changed) {
    fs.writeFileSync(file, lines.join(src.includes("\r\n") ? "\r\n" : "\n"), "utf8");
    fixedCount++;
  }
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p);
    } else if (EXT.has(path.extname(e.name)) && !SKIP_FILES.has(e.name)) {
      scanFile(p);
    }
  }
}

for (const r of roots) {
  if (fs.statSync(r).isDirectory()) walk(r);
  else scanFile(r);
}

if (!hits.length) {
  console.log("us-english OK — no British spellings in authored source");
  process.exit(0);
}

if (FIX) {
  console.log(`us-english: fixed ${hits.length} occurrence(s) in ${fixedCount} file(s)`);
  for (const h of hits) console.log(`  ${path.relative(ROOT, h.file)}:${h.line}  ${h.found} -> ${h.fix}`);
  process.exit(0);
}

console.error(`us-english FAILED — ${hits.length} British spelling(s) in ${new Set(hits.map((h) => h.file)).size} file(s):\n`);
for (const h of hits) {
  console.error(`  ${path.relative(ROOT, h.file)}:${h.line}:${h.col}  ${h.found} -> ${h.fix}`);
}
console.error(`\nThese are US sites for a US audience.`);
console.error(`Fix them:            npm run fix:spelling`);
console.error(`Genuine proper noun? add a "${ESCAPE}" comment on that line.`);
process.exit(1);
