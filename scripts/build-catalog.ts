// Builds data/catalog.json from what scripts/scrape-northerngecko.mjs and the product sitemaps collected.
// Every product with a photo is kept. Where the listing has no shipping dimensions or weight we
// estimate them from the product's category and size words, and record that they were estimated.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const RAW = path.resolve("data/raw");
const IN = 25.4;
const LB = 453.592;

type Handling = "standard" | "live" | "frozen";
type Source = "listing" | "estimated";

interface ShopifyVariant {
  title: string;
  price: string;
  grams: number;
  sku: string | null;
  requires_shipping: boolean;
  available: boolean;
}
interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html: string | null;
  vendor: string;
  product_type: string;
  tags: string[] | string;
  variants: ShopifyVariant[];
  images: { src: string }[];
}

export interface CatalogProduct {
  id: string;
  handle: string;
  title: string;
  url: string;
  image: string;
  vendor: string | null;
  productType: string | null;
  category: string;
  priceCents: number | null;
  sku: string;
  dims: { l: number; w: number; h: number };
  dimsSource: Source;
  dimsNote: string;
  weight: number;
  weightSource: Source;
  weightNote: string;
  handling: Handling;
  fragile: boolean;
  keepUpright: boolean;
  shipsInOwnBox: boolean;
  maxLoad: number;
  requiresShipping: boolean;
  pickupOnly: boolean;
}

// ───────────────────────── sources ─────────────────────────

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

function readSitemaps() {
  const out: { handle: string; url: string; title: string; image: string }[] = [];
  for (const f of ["sm1.xml", "sm2.xml"]) {
    const p = path.join(RAW, f);
    if (!existsSync(p)) continue;
    const xml = readFileSync(p, "utf8");
    for (const block of xml.split("<url>").slice(1)) {
      const loc = /<loc>([^<]+)<\/loc>/.exec(block)?.[1];
      const img = /<image:loc>([^<]+)<\/image:loc>/.exec(block)?.[1];
      const title = /<image:title>([^<]*)<\/image:title>/.exec(block)?.[1];
      if (!loc || !img || !title || !loc.includes("/products/")) continue;
      out.push({ handle: loc.split("/products/")[1], url: loc, title: decode(title), image: decode(img) });
    }
  }
  return out;
}

function readFeed(): Map<string, ShopifyProduct> {
  const map = new Map<string, ShopifyProduct>();
  if (!existsSync(RAW)) return map;
  for (const f of readdirSync(RAW).filter((f) => /^products-\d+\.json$/.test(f))) {
    const { products } = JSON.parse(readFileSync(path.join(RAW, f), "utf8")) as { products: ShopifyProduct[] };
    for (const p of products) map.set(p.handle, p);
  }
  return map;
}

// ───────────────────────── parsing helpers ─────────────────────────

const num = (s: string) => {
  if (s.includes("/")) {
    const [a, b] = s.split("/").map(Number);
    return a / b;
  }
  return Number(s);
};

/** "12x12x18\"", "12'' x 9'' x 6''", "90 x 45 x 45 cm" → mm (sorted as listed). */
function parse3d(text: string): { l: number; w: number; h: number } | null {
  const m = /(\d+(?:\.\d+)?)\s*(?:"|''|in\b|inch(?:es)?|cm)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:"|''|in\b|inch(?:es)?|cm)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*("|''|in\b|inch(?:es)?|cm)?/i.exec(
    text,
  );
  if (!m) return null;
  const unit = /cm/i.test(m[0]) ? 10 : IN;
  const [a, b, c] = [num(m[1]), num(m[2]), num(m[3])].map((v) => v * unit);
  if ([a, b, c].some((v) => !v || v > 2500)) return null;
  return { l: a, w: b, h: c };
}

/** A single length in inches such as 'T5 HO 24"' or '33" Tall'. */
function parseLength(text: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(?:\+)?\s*(?:"|''|-inch|\s?inch)/i.exec(text);
  if (!m) return null;
  const v = Number(m[1]);
  return v > 0 && v < 120 ? v * IN : null;
}

/** Net weight in grams from '150g', '2lbs', '8.5oz', '2.11 oz.', '1.5L', '2800g'. */
function parseWeight(text: string): number | null {
  let m = /(\d+(?:\.\d+)?)\s*(kg)\b/i.exec(text);
  if (m) return Number(m[1]) * 1000;
  m = /(\d+(?:\.\d+)?)\s*(g|grams?)\b/i.exec(text);
  if (m) return Number(m[1]);
  m = /(\d+(?:\.\d+)?)\s*(lbs?|pounds?)\b/i.exec(text);
  if (m) return Number(m[1]) * LB;
  m = /(\d+(?:\.\d+)?)\s*(?:fl\.?\s*)?oz\b/i.exec(text);
  if (m) return Number(m[1]) * 28.35;
  m = /(\d+(?:\.\d+)?)\s*(l|litre|liter)s?\b/i.exec(text);
  if (m) return Number(m[1]) * 1000;
  m = /(\d+)\s*qt\b/i.exec(text);
  if (m) return Number(m[1]) * 1100 * 0.35; // dry substrate per quart
  return null;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

const sizeScale = (t: string) =>
  /\b(xx-?large|jumbo|giant|xxl)\b/i.test(t)
    ? 1.6
    : /\b(x-?large|xl)\b/i.test(t)
      ? 1.4
      : /\blarge\b/i.test(t)
        ? 1.25
        : /\b(mini|nano|tiny)\b/i.test(t)
          ? 0.65
          : /\bsmall\b/i.test(t)
            ? 0.8
            : 1;

// ───────────────────────── category rules ─────────────────────────

interface Rule {
  category: string;
  test: RegExp;
  /** Packed size in inches before size words and variance. */
  size: [number, number, number];
  lb: number;
  handling?: Handling;
  fragile?: boolean;
  upright?: boolean;
  own?: boolean;
  maxLoadLb?: number;
  note: string;
}

const LIVE_CODE = /\b[\w()]*-\d{4}-\d{1,3}\)?\s*$/;
const LIVE_START = /^(male|female|unsexed|poss\.?|prob\.?|probable|possible|rtb|super x|liberman|extreme|het|pair|trio|mystery crested)\b/i;
const LIVE_END = /(?:\b|–\s*)(male|female|unsexed)!?\s*$/i;
// Breeder ID codes such as (NGNLP-AL-3) or (NGNLP-(ALP)-1) – uppercase only, so "(Coco-Fibre)" is not an animal.
const LIVE_ID = /\((?:[A-Z]{2,}[A-Z0-9]*|\()(?:-[A-Z0-9()]+)+\)\s*$/;
const LIVE_SPECIES = /^(E\.|R\.|C\.|M\.|U\.)\s?[a-z]+/;

const RULES: Rule[] = [
  { category: "Gift cards", test: /gift ?card/i, size: [4, 3, 0.1], lb: 0.02, note: "Digital item" },
  { category: "Frozen feeders", test: /\bfrozen\b|\bpinkies?\b|\bfuzzies?\b|\bhoppers? mice\b/i, size: [9, 6, 2], lb: 1, handling: "frozen", upright: false, maxLoadLb: 6, note: "Frozen bag" },
  { category: "Diets & food", test: /can o'?|canned|freeze[- ]dried|pur[ée]e|wafers|pillars/i, size: [4, 3, 3], lb: 0.3, note: "Can, tub or pouch" },
  { category: "Shipping supplies", test: /heat pack|cryopak|cyropak|phase 22|cold pack|ice pack|shipping box/i, size: [7, 5, 2], lb: 0.4, note: "Shipping consumable" },
  { category: "Live feeders", test: /\b(eco-fresh|live|crickets?|dubia|mealworms?|superworms?|hornworms?|silkworms?|bsfl|black soldier fly larvae|waxworms?|roaches|isopods?|springtails)\b/i, size: [6, 4, 3], lb: 0.4, handling: "live", upright: true, maxLoadLb: 2, note: "Vented feeder cup/bag" },
  { category: "Enclosures", test: /terrarium(?!.*(mesh|light|plant|background|lock|drain|waterfall|latch))|enclosure|aquarium kit|flex aquarium|spec aquarium|\btank\b|stacker|habitat kit|front opening|tortoise yard|screen cage|open air|reptibreeze(?! substrate)|faunarium|creatures den|display case|breeding box|reptile den|vivarium(?! electronics)/i, size: [24, 18, 18], lb: 28, fragile: true, upright: true, own: true, maxLoadLb: 15, note: "Glass/PVC enclosure in maker's carton" },
  { category: "Incubators", test: /incubator(?! .*usb)/i, size: [16, 14, 12], lb: 8, fragile: true, upright: true, own: true, maxLoadLb: 20, note: "Boxed incubator" },
  { category: "Lighting kits", test: /lighting (kit|combo)|combo pack|compact kit|light kit|uvb & heat/i, size: [14, 10, 8], lb: 3, fragile: true, maxLoadLb: 10, note: "Boxed lighting kit" },
  { category: "Lighting fixtures", test: /\b(t5|t8|ho)\b.*\b(kit|fixture|hood|controller)\b|\bhood\b|lumenize|terrasky|sunblaster(?!.*(cord|hang))|led (bar|panel|fixture)|light ?kit/i, size: [26, 4, 3], lb: 2.6, fragile: true, maxLoadLb: 8, note: "Linear fixture" },
  { category: "UVB tubes", test: /\b(t5|t8)\b.*\b(bulb|tube|lamp)\b|uvb.*\b(bulb|tube)\b|replacement bulb|reptisun.*t[58]/i, size: [26, 2, 2], lb: 0.5, fragile: true, maxLoadLb: 3, note: "Boxed fluorescent tube" },
  { category: "Dome & clamp fixtures", test: /dome|clamp lamp|lamp fixture|reflector|lamp bracket|lamp holder|lamp stand/i, size: [10, 10, 7], lb: 1.3, fragile: false, maxLoadLb: 6, note: "Boxed fixture" },
  { category: "Heat & spot bulbs", test: /bulb|lamp|basking spot|heat emitter|\bche\b|halogen|projector|mercury|night ?glo|daylight|powersun|uvb \d+|nano uvb|reptile vision|full moon|glow light|natural light|grow light|flashlight/i, size: [4.5, 4.5, 7], lb: 0.4, fragile: true, maxLoadLb: 4, note: "Boxed bulb" },
  { category: "Heat mats & cables", test: /heat (mat|pad|cable|tape|wave)|heatmat|heating pad|ptc/i, size: [12, 9, 1], lb: 0.7, note: "Flat retail sleeve" },
  { category: "Electronics & heaters", test: /thermostat|thermometer|hygrometer|thermo-hygro|timer|controller|meter|probe|sensor|hobby stat|heater|therm\b|turtletherm|reptitherm|fan\b|scale\b|ibalance|fuse|power cord|loupe/i, size: [8, 6, 3], lb: 0.9, note: "Boxed electronics" },
  { category: "Misting & water", test: /monsoon|mist|fogger|humidifier|sprayer|dripper|fountain|pump|rain ?zone|nozzle|union|tubing|backbone/i, size: [10, 8, 6], lb: 2, note: "Boxed misting/water hardware" },
  { category: "Filters & media", test: /filter|cartridge|foam|media|ammonia|zeolite|zeo|carbon|sponge|canister|bio-?balls|hydroballs/i, size: [9, 7, 5], lb: 1.5, note: "Filter or media pack" },
  { category: "Water care", test: /conditioner|conditoner|treatment|cleaner|sludge|remover|dechlor|bacteria|h2o|derma|gel\b|ointment|spray\b|wipes|electrolyte|soak|shed aid|silicone|sealant|salt\b|betadine|solution|dispenser|water well/i, size: [6, 3, 3], lb: 0.7, upright: true, note: "Bottle – keep upright" },
  { category: "Supplements", test: /calcium|vitamin|vite|superload|d3|supplement|minerals?|probiotic|revitalise/i, size: [3.2, 3.2, 4.2], lb: 0.35, upright: true, note: "Supplement jar" },
  { category: "Diets & food", test: /diet|food|repashy|pangea(?!.*(cup|dish|plant|pin|bush|holder))|sticks|pellets|grubs|jelly|leopagel|buffet|grazer|treats?|mix\b|nectar|salad|snails|larvae|cuttlebone|block\b/i, size: [5, 3.5, 3], lb: 0.45, note: "Pouch or jar" },
  { category: "Botanicals & leaf litter", test: /\bpods?\b|petals|coco hair|mushrooms|talami|palm torch|botanicals|seed pods|diced coco|mahogany stars|twisted spring|monkey pot|devil's purse|coco para/i, size: [8, 6, 3], lb: 0.2, note: "Dried botanicals bag" },
  { category: "Mats & liners", test: /\bmat\b|repti-?pads|liners?|terrarium mesh|carpet/i, size: [16, 10, 1.5], lb: 0.6, note: "Rolled/flat mat" },
  { category: "Substrate", test: /substrate|bark|earth|soil|sand|coco(nut)? (fib|chip|husk|block)|coir|moss|husk|bedding|carpet|eco earth|clay|leaf litter|leaves|gravel|pebbles?\b(?! rock)|tropicoco|bio ?drain|drainage/i, size: [14, 10, 5], lb: 5, maxLoadLb: 60, note: "Bagged substrate" },
  { category: "Rocks & stone", test: /\b(rock|stones?|slate|onyx|jasper|lava|petrified|boulder|pebble rock|marti|queen|red japonica)\b/i, size: [8, 6, 5], lb: 4.5, maxLoadLb: 80, note: "Natural stone, wrapped" },
  { category: "Wood & branches", test: /wood|branch|driftwood|cork|log|root|vine wood|cholla|grapevine|bamboo|viking|natraj|manzanita/i, size: [14, 6, 5], lb: 1.6, note: "Natural wood" },
  { category: "Waterfalls & features", test: /waterfall|cascade|water feature/i, size: [12, 9, 9], lb: 3.5, fragile: true, upright: true, maxLoadLb: 6, note: "Resin feature with pump" },
  { category: "Plants", test: /plant|dandelion|vine|bush|ivy|orchid|monstera|zebrina|caladium|philodendron|ficus|pothos|scindapsus|flora|leaf|cactus|grass|fern|succulent|tree\b|bromelia|duckweed/i, size: [12, 6, 5], lb: 0.6, maxLoadLb: 5, note: "Artificial plant, boxed" },
  { category: "Hides & decor", test: /hide|cave|shelter|hut|hammock|ledge|ramp|platform|outcrop|background|backdrop|decor|ornament|skull|bowl|dish|cup holder|feeding cup|ledges?|hideaway|basking|island|lounger|totem|eggs\b|dock\b|bath\b|bug house|ozelot|sign\b|frog pond|coconut whole/i, size: [7, 6, 4.5], lb: 1, maxLoadLb: 15, note: "Boxed décor" },
  { category: "Cups & husbandry tools", test: /deli cup|cups?\b|lids?\b|tongs|tweezers|forceps|hemostat|speculum|scissors|cutter|\bnet\b|hook|scoop|feeder|tool|bag|egg crate|incubation box|bracket|hangers?|clips?|lock for|latch|compact top|support base|excelsior/i, size: [9, 5, 4], lb: 0.5, note: "Supplies pack" },
  { category: "Books", test: /book|edition|guide|manual|the life of|theory of|replication in|popular \w+ &/i, size: [10, 7.5, 1], lb: 1.3, note: "Book in mailer" },
  { category: "Merch", test: /pin\b|keychain|sticker|shirt|hoodie|hat\b|mug|magnet|print\b|artwork|plush/i, size: [5, 4, 1], lb: 0.15, note: "Small merch" },
  { category: "Bird & small pet", test: /parrot|bird|avian|hamster|rabbit|ferret|betta|fish/i, size: [8, 6, 4], lb: 0.7, note: "Boxed pet supply" },
];

const LIVE_RULE: Rule = { category: "Live animals", test: /./, size: [5, 5, 4.5], lb: 0.25, handling: "live", upright: true, fragile: false, maxLoadLb: 1, note: "Animal in vented deli cup" };
const DEFAULT_RULE: Rule = { category: "General supplies", test: /./, size: [8, 6, 4], lb: 1, note: "General boxed item" };

function classify(title: string, type: string | null, tags: string): Rule {
  const hay = `${title} ${type ?? ""}`;
  if (LIVE_START.test(title) || LIVE_CODE.test(title) || LIVE_END.test(title) || LIVE_ID.test(title) || LIVE_SPECIES.test(title) || /\blive animal|crested gecko \(|gargoyle gecko \(/i.test(type ?? "")) return LIVE_RULE;
  for (const r of RULES) if (r.test.test(hay)) return r;
  if (tags && /frozen/i.test(tags)) return RULES.find((r) => r.category === "Frozen feeders")!;
  return DEFAULT_RULE;
}

const quarter = (mm: number) => Math.max(IN * 0.5, Math.round(mm / (IN / 4)) * (IN / 4));

function build(): CatalogProduct[] {
  const sitemap = readSitemaps();
  const feed = readFeed();
  console.log(`sitemap products: ${sitemap.length}, feed products: ${feed.size}`);
  const out: CatalogProduct[] = [];
  const seen = new Set<string>();

  for (const s of sitemap) {
    if (seen.has(s.handle)) continue;
    seen.add(s.handle);
    const f = feed.get(s.handle);
    const title = f ? decode(f.title) : s.title;
    const type = f?.product_type || null;
    const tags = f ? (Array.isArray(f.tags) ? f.tags.join(",") : f.tags) : "";
    const body = f?.body_html ? decode(f.body_html.replace(/<[^>]+>/g, " ")) : "";
    const variant = f?.variants.find((v) => v.available) ?? f?.variants[0];
    const rule = classify(title, type, tags);
    const r = hash(s.handle);
    const jitter = (v: number, k: string) => v * (0.88 + 0.24 * hash(s.handle + k));

    // ── dimensions ──
    let dims: { l: number; w: number; h: number };
    let dimsSource: Source = "estimated";
    let dimsNote: string;
    const listed3d = parse3d(title) ?? parse3d(variant?.title ?? "") ?? parse3d(body);
    const listedLen = parseLength(title);
    const isLinear = /fixtures|tubes/i.test(rule.category);

    if (listed3d && !/Live|Feeders|Merch|Books/.test(rule.category)) {
      const allowance = rule.own ? IN * 2 : IN * 0.5; // maker's carton around the listed product size
      const sides = [listed3d.l, listed3d.w, listed3d.h].sort((a, b) => b - a);
      if (rule.category === "Enclosures") {
        // Listed as W × D × H; keep height vertical.
        dims = { l: listed3d.l + allowance, w: listed3d.w + allowance, h: listed3d.h + allowance };
      } else dims = { l: sides[0] + allowance, w: sides[1] + allowance, h: sides[2] + allowance };
      dimsSource = "listing";
      dimsNote = `From listed size ${[listed3d.l, listed3d.w, listed3d.h].map((v) => Math.round((v / IN) * 10) / 10).join(" × ")} in, plus ${allowance / IN}" packaging`;
    } else if (listedLen && (isLinear || /Plants|Wood|Enclosures/.test(rule.category))) {
      const len = listedLen + IN * 2;
      const [, w, h] = rule.size;
      const coiled = /vine/i.test(title) && listedLen > IN * 30;
      dims = coiled ? { l: IN * 12, w: IN * 9, h: IN * 4 } : { l: len, w: jitter(w * IN, "w"), h: jitter(h * IN, "h") };
      dimsNote = coiled
        ? `Estimated: ${Math.round(listedLen / IN)}" vine ships coiled`
        : `Estimated: length from listing (${Math.round(listedLen / IN)}"), cross-section from category “${rule.category}”`;
    } else {
      const k = sizeScale(title);
      dims = {
        l: jitter(rule.size[0] * IN * k, "l"),
        w: jitter(rule.size[1] * IN * k, "w"),
        h: jitter(rule.size[2] * IN * (k > 1 ? 1 + (k - 1) * 0.6 : k), "h"),
      };
      dimsNote = `Estimated from category “${rule.category}” (${rule.note.toLowerCase()})${k !== 1 ? `, scaled ×${k} for size in title` : ""}`;
    }
    dims = { l: quarter(dims.l), w: quarter(dims.w), h: quarter(dims.h) };

    // ── weight ──
    let weight: number;
    let weightSource: Source = "estimated";
    let weightNote: string;
    const titleNet = rule.category === "Live animals" ? null : parseWeight(title);
    if (variant && variant.grams > 0) {
      weight = variant.grams;
      weightSource = "listing";
      weightNote = "Shopify variant weight";
    } else if (titleNet && titleNet > 5) {
      const packaging = Math.max(40, titleNet * 0.12);
      weight = titleNet + packaging;
      weightSource = "listing";
      weightNote = `Net ${Math.round(titleNet)} g from title + packaging`;
    } else if (rule.category === "Enclosures") {
      const sqIn = (2 * (dims.l * dims.w + dims.l * dims.h + dims.w * dims.h)) / (IN * IN);
      const glass = /acrylic|pvc|screen|mesh|fold|plastic|repti ?breeze/i.test(title) ? 0.004 : 0.0105;
      weight = sqIn * glass * LB + 1200;
      weightNote = `Estimated from panel area (${Math.round(sqIn)} sq in of ${glass > 0.005 ? "glass" : "PVC/acrylic"}) + carton`;
    } else if (rule.category === "Live animals") {
      const giant = /leachianus|leachie|yate|nuu ana|koghis|ua ?pou|grand terre|pine island|moro|bayonnaise|giant|tortoise|skink|egernia|tiliqua|bearded/i.test(title);
      weight = giant ? 320 : 95;
      dims = giant ? { l: IN * 6.5, w: IN * 6.5, h: IN * 5 } : dims;
      weightNote = giant ? "Estimated: large gecko/skink in 64 oz cup" : "Estimated: animal in 32 oz vented deli cup";
      if (giant) dimsNote = "Estimated: 64 oz shipping cup for a large species";
    } else {
      const vol = (dims.l * dims.w * dims.h) / (rule.size[0] * rule.size[1] * rule.size[2] * IN ** 3);
      weight = rule.lb * LB * Math.max(0.4, Math.min(3, vol)) * (0.9 + 0.2 * r);
      weightNote = `Estimated from category “${rule.category}”`;
    }
    weight = Math.max(15, Math.round(weight));

    const pickupOnly = /pick-?up only/i.test(title) || /pickup[- ]only/i.test(tags);
    const requiresShipping = rule.category !== "Gift cards" && (variant ? variant.requires_shipping : true);
    const price = variant ? Math.round(Number(variant.price) * 100) : null;

    out.push({
      id: f ? String(f.id) : s.handle,
      handle: s.handle,
      title,
      url: s.url,
      image: s.image,
      vendor: f?.vendor || null,
      productType: type,
      category: rule.category,
      priceCents: price,
      sku: variant?.sku || `NG-${s.handle.slice(0, 24).toUpperCase()}`,
      dims: { l: Math.round(dims.l), w: Math.round(dims.w), h: Math.round(dims.h) },
      dimsSource,
      dimsNote,
      weight,
      weightSource,
      weightNote,
      handling: rule.handling ?? "standard",
      fragile: !!rule.fragile,
      keepUpright: !!rule.upright,
      shipsInOwnBox: !!rule.own,
      maxLoad: Math.round((rule.maxLoadLb ?? 40) * LB),
      requiresShipping,
      pickupOnly,
    });
  }
  return out;
}

const products = build();
writeFileSync("data/catalog.json", JSON.stringify(products, null, 1));
const by = (k: (p: CatalogProduct) => string) =>
  Object.entries(products.reduce<Record<string, number>>((m, p) => ((m[k(p)] = (m[k(p)] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
console.log(`wrote ${products.length} products`);
console.log("categories:", by((p) => p.category));
console.log("dims:", by((p) => p.dimsSource), "weight:", by((p) => p.weightSource));
console.log("handling:", by((p) => p.handling), "pickup-only:", products.filter((p) => p.pickupOnly).length);
