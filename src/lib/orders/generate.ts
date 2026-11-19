import { CITIES } from "@/lib/geo";

// Demo order generator. Customers, streets and businesses are invented; cities and
// postal-code prefixes are real so the rate engine has real distances to work with.

export interface PoolProduct {
  id: string;
  category: string;
  title: string;
  priceCents: number | null;
  dimsSource: string;
}

export interface DraftOrder {
  scenario: string;
  channel: "web" | "wholesale" | "phone" | "api";
  customer: string;
  company: string | null;
  email: string;
  phone: string;
  address1: string;
  city: string;
  province: string;
  postal: string;
  residential: boolean;
  note: string | null;
  lines: { productId: string; qty: number; priceCents: number }[];
}

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Avery", "Jordan", "Priya", "Mateo", "Noor", "Ethan", "Chloé", "Kenji", "Sasha", "Malik", "Ingrid", "Tariq", "Hana", "Liam", "Rosalie", "Dev", "Maëlle", "Owen", "Amara", "Felix", "Wren", "Arjun", "Talia", "Quinn"];
const LAST = ["Okafor", "Lindqvist", "Tremblay", "Nakamura", "Desrosiers", "Haddad", "MacLeod", "Petrov", "Gauthier", "Singh", "Whitford", "Castellano", "Bergeron", "Achebe", "Kowalczyk", "Fairweather", "Moreau", "Ishikawa", "Delacroix", "Brennan"];
const STREETS = ["Maple Ridge Rd", "Larkspur Ave", "Hollis St", "Copperfield Dr", "Tamarack Cres", "Juniper Way", "Bayview Terrace", "Old Mill Ln", "Kestrel Ct", "Prairie Rose Blvd", "Harbour Light Dr", "Birchwood Pl", "Rue des Érables", "Cedar Hollow Rd"];
const SHOPS = ["Prairie Scales Pet Supply", "Tidewater Exotics", "Boreal Herp Co.", "Canopy & Claw Pets", "Northlight Reptile Centre", "Granite Coast Aquatics & Reptiles", "Silverleaf Pet Emporium", "Muskoka Critter Supply"];

const pick = <T,>(rng: Rng, list: T[]): T => list[Math.floor(rng() * list.length)];
const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

function postal(rng: Rng, fsa: string) {
  const L = "ABCEGHJKLMNPRSTVXY";
  return `${fsa} ${int(rng, 1, 9)}${L[int(rng, 0, L.length - 1)]}${int(rng, 0, 9)}`;
}

interface Scenario {
  key: string;
  label: string;
  channel: DraftOrder["channel"];
  business?: boolean;
  note?: string;
  build: (take: Taker, rng: Rng) => void;
}

type Taker = (category: string | string[], qty?: number | [number, number], filter?: (p: PoolProduct) => boolean) => void;

export const SCENARIOS: Scenario[] = [
  {
    key: "starter",
    label: "Care top-up",
    channel: "web",
    build: (take) => {
      take("Diets & food", [1, 2]);
      take("Supplements");
      take("Cups & husbandry tools", [1, 3]);
    },
  },
  {
    key: "bioactive",
    label: "Bioactive build with glass terrarium",
    channel: "web",
    note: "Gift – please no invoice in the box",
    build: (take) => {
      take("Enclosures", 1, (p) => p.dimsSource === "listing" && !/pick-?up/i.test(p.title));
      take("Substrate", 2);
      take("Botanicals & leaf litter", [1, 2]);
      take("Plants");
      take("Plants");
      take("Hides & decor");
      take(["Lighting fixtures", "Lighting kits"]);
      take("Heat & spot bulbs");
    },
  },
  {
    key: "live",
    label: "Crested gecko + care kit",
    channel: "web",
    note: "Customer home after 5pm",
    build: (take) => {
      take("Live animals", 1);
      take("Live animals", 1);
      take("Diets & food");
      take("Supplements");
      take("Cups & husbandry tools");
      take("Plants");
    },
  },
  {
    key: "feeders",
    label: "Live feeders restock",
    channel: "web",
    build: (take) => {
      take("Live feeders", [1, 3]);
      take("Live feeders", [1, 2]);
      take("Live feeders", [1, 2]);
      take("Supplements");
      take("Diets & food");
    },
  },
  {
    key: "lighting",
    label: "Lighting upgrade",
    channel: "phone",
    build: (take) => {
      take("Lighting fixtures", 1);
      take("Lighting fixtures", 1);
      take("UVB tubes", [1, 2]);
      take("Dome & clamp fixtures");
      take("Heat & spot bulbs", [2, 3]);
      take("Electronics & heaters");
    },
  },
  {
    key: "restock",
    label: "Pet store restock",
    channel: "wholesale",
    business: true,
    note: "Dock door 3 · receiving 8am–2pm",
    build: (take) => {
      take("Substrate", [12, 20]);
      take("Substrate", [10, 16]);
      take("Substrate", [8, 12]);
      take("Diets & food", [12, 24]);
      take("Diets & food", [12, 24]);
      take("Diets & food", [8, 16]);
      take("Supplements", [12, 18]);
      take("Supplements", [8, 12]);
      take("Hides & decor", [6, 10]);
      take("Hides & decor", [4, 8]);
      take("Heat & spot bulbs", [12, 24]);
      take("Water care", [8, 12]);
      take("Cups & husbandry tools", [6, 12]);
      take("Plants", [6, 10]);
      take("Electronics & heaters", [4, 6]);
      take("Rocks & stone", [6, 10]);
      take("Wood & branches", [4, 8]);
    },
  },
  {
    key: "two-tanks",
    label: "Two enclosures + full fit-out",
    channel: "web",
    build: (take) => {
      take("Enclosures", 1, (p) => p.dimsSource === "listing" && !/pick-?up/i.test(p.title));
      take("Enclosures", 1, (p) => !/pick-?up/i.test(p.title));
      take("Substrate", [3, 5]);
      take("Wood & branches", [2, 3]);
      take("Plants", [3, 4]);
      take("Hides & decor", [2, 3]);
      take("Lighting kits", [1, 2]);
      take("Electronics & heaters", [1, 2]);
    },
  },
  {
    key: "mixed",
    label: "Mixed web order",
    channel: "web",
    build: (take, rng) => {
      const cats = ["Diets & food", "Hides & decor", "Plants", "Substrate", "Heat & spot bulbs", "Wood & branches", "Water care", "Misting & water", "Rocks & stone", "Books", "Merch", "Electronics & heaters"];
      const n = 3 + Math.floor(rng() * 5);
      for (let i = 0; i < n; i++) take(cats[Math.floor(rng() * cats.length)], [1, 2]);
    },
  },
];

export function generateOrder(pool: PoolProduct[], rng: Rng, scenarioKey?: string): DraftOrder {
  const scenario = SCENARIOS.find((s) => s.key === scenarioKey) ?? pick(rng, SCENARIOS);
  const byCat = new Map<string, PoolProduct[]>();
  for (const p of pool) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p]);
  const lines = new Map<string, { productId: string; qty: number; priceCents: number }>();

  const take: Taker = (category, qty = 1, filter) => {
    const cats = Array.isArray(category) ? category : [category];
    let candidates = cats.flatMap((c) => byCat.get(c) ?? []);
    if (filter) {
      const f = candidates.filter(filter);
      if (f.length) candidates = f;
    }
    candidates = candidates.filter((c) => !lines.has(c.id));
    if (!candidates.length) return;
    const p = pick(rng, candidates);
    const q = Array.isArray(qty) ? int(rng, qty[0], qty[1]) : qty;
    lines.set(p.id, { productId: p.id, qty: q, priceCents: p.priceCents ?? estimatePrice(p.category, rng) });
  };
  scenario.build(take, rng);

  const city = pick(rng, CITIES);
  const first = pick(rng, FIRST);
  const last = pick(rng, LAST);
  const company = scenario.business ? pick(rng, SHOPS) : null;
  return {
    scenario: scenario.label,
    channel: scenario.channel,
    customer: `${first} ${last}`,
    company,
    email: `${first}.${last}`.toLowerCase().normalize("NFD").replace(/[^\w.]/g, "") + "@example.com",
    phone: `(${pick(rng, ["403", "604", "204", "306", "613", "514", "902", "506", "709", "780", "250", "519"])}) 555-0${int(rng, 100, 199)}`,
    address1: `${int(rng, 12, 9800)} ${pick(rng, STREETS)}`,
    city: city.city,
    province: city.province,
    postal: postal(rng, pick(rng, city.fsa)),
    residential: !scenario.business,
    note: scenario.note ?? null,
    lines: [...lines.values()],
  };
}

/** Demo prices for products whose listing price we could not read. */
function estimatePrice(category: string, rng: Rng) {
  const base: Record<string, number> = {
    "Live animals": 24_900,
    Enclosures: 21_900,
    "Lighting kits": 9_900,
    "Lighting fixtures": 7_900,
    "Electronics & heaters": 5_400,
    "Misting & water": 6_900,
    Substrate: 2_299,
    "Diets & food": 1_899,
    Supplements: 1_499,
  };
  const b = base[category] ?? 1_799;
  return Math.round((b * (0.75 + rng() * 0.6)) / 100) * 100 - 1;
}
