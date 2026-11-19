import { addBusinessDays, nextLiveShipDay } from "./dates";
import {
  billableWeight,
  freightClass,
  G_PER_LB,
  isLargePackage,
  needsAdditionalHandling,
} from "./packing/freight";
import type { Dims, Handling } from "./packing/types";
import { cityFor, distanceKm, novemberLow, ORIGIN } from "./geo";

// Demo rate engine. Prices are invented but behave like real Canadian carrier tariffs:
// distance zones, dimensional weight, fuel, residential and handling surcharges, NMFC class for LTL.

export interface RatePiece {
  id: string;
  kind: "parcel" | "pallet";
  dims: Dims;
  weight: number;
  handling: Handling;
}

export interface RateRequest {
  pieces: RatePiece[];
  destination: { city: string; province: string; residential: boolean };
  declaredValueCents: number;
  today?: Date;
}

export interface RateLine {
  label: string;
  cents: number;
}

export interface RateQuote {
  id: string;
  carrier: string;
  carrierCode: string;
  service: string;
  mode: "parcel" | "ltl";
  totalCents: number;
  lines: RateLine[];
  transitDays: number;
  shipDate: string;
  deliveryDate: string;
  guaranteed: boolean;
  co2Kg: number;
  tags: ("cheapest" | "fastest" | "best value")[];
  notes: string[];
}

interface ParcelService {
  carrier: string;
  code: string;
  service: string;
  base: number;
  perKg: number;
  speed: number; // multiplier on ground transit
  mult: number;
  guaranteed: boolean;
  live: boolean;
}

const PARCEL: ParcelService[] = [
  { carrier: "Canada Post", code: "CPC", service: "Regular Parcel", base: 1090, perKg: 118, speed: 1.15, mult: 1, guaranteed: false, live: false },
  { carrier: "Canada Post", code: "CPC", service: "Xpresspost", base: 1640, perKg: 176, speed: 0.55, mult: 1, guaranteed: true, live: false },
  { carrier: "Purolator", code: "PUR", service: "Ground", base: 1180, perKg: 124, speed: 1, mult: 1, guaranteed: true, live: false },
  { carrier: "Purolator", code: "PUR", service: "Express", base: 1890, perKg: 205, speed: 0.4, mult: 1, guaranteed: true, live: true },
  { carrier: "UPS", code: "UPS", service: "Standard", base: 1240, perKg: 131, speed: 1, mult: 1, guaranteed: true, live: false },
  { carrier: "UPS", code: "UPS", service: "Express Saver", base: 2280, perKg: 232, speed: 0.35, mult: 1, guaranteed: true, live: true },
  { carrier: "FedEx", code: "FDX", service: "Ground", base: 1160, perKg: 127, speed: 1.05, mult: 1, guaranteed: true, live: false },
  { carrier: "FedEx", code: "FDX", service: "Priority Overnight", base: 2690, perKg: 251, speed: 0.25, mult: 1, guaranteed: true, live: true },
  { carrier: "Canpar", code: "CAN", service: "Ground", base: 980, perKg: 112, speed: 1.1, mult: 1, guaranteed: false, live: false },
  { carrier: "Loomis Express", code: "LOO", service: "Ground", base: 1020, perKg: 116, speed: 1.1, mult: 1, guaranteed: false, live: false },
];

interface LtlCarrier {
  carrier: string;
  code: string;
  service: string;
  min: number;
  cwt: number;
  speed: number;
  guaranteed: boolean;
}

const LTL: LtlCarrier[] = [
  { carrier: "Day & Ross", code: "DNR", service: "LTL Standard", min: 17_900, cwt: 2050, speed: 1, guaranteed: false },
  { carrier: "Manitoulin Transport", code: "MAN", service: "LTL", min: 16_800, cwt: 1980, speed: 1.1, guaranteed: false },
  { carrier: "TST-CF Express", code: "TST", service: "LTL", min: 18_600, cwt: 2120, speed: 0.95, guaranteed: false },
  { carrier: "Purolator Freight", code: "PFR", service: "LTL Guaranteed", min: 22_400, cwt: 2390, speed: 0.85, guaranteed: true },
];

function seeded(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

function zone(km: number) {
  return km < 120 ? 1 : km < 400 ? 2 : km < 900 ? 3 : km < 1600 ? 4 : km < 2400 ? 5 : km < 3300 ? 6 : km < 4200 ? 7 : 8;
}

const ZONE_MULT = [0, 0.82, 0.95, 1.08, 1.24, 1.42, 1.58, 1.74, 2.1];
const FUEL = { parcel: 0.215, ltl: 0.318 };

export function quoteRates(req: RateRequest): RateQuote[] {
  const today = req.today ?? new Date();
  const dest = cityFor(req.destination.city, req.destination.province);
  const km = dest ? distanceKm(ORIGIN, dest) : 1500;
  const z = zone(km);
  const groundDays = Math.max(1, Math.round(km / 650) + (z >= 7 ? 2 : 0));
  const parcels = req.pieces.filter((p) => p.kind === "parcel");
  const pallets = req.pieces.filter((p) => p.kind === "pallet");
  const hasLive = parcels.some((p) => p.handling === "live");
  const hasFrozen = parcels.some((p) => p.handling === "frozen");
  const quotes: RateQuote[] = [];
  const co2Parcel = (kg: number) => Math.round(kg * km * 0.00022 * 10) / 10;
  const co2Ltl = (kg: number) => Math.round(kg * km * 0.000085 * 10) / 10;

  // Temperature-controlled pieces need an expedited service with a live-animal program.
  const shipDate = hasLive ? nextLiveShipDay(today) : today;

  if (parcels.length) {
    for (const s of PARCEL) {
      if ((hasLive || hasFrozen) && !s.live) continue;
      const jitter = 0.94 + seeded(s.code + s.service + req.destination.city) * 0.12;
      const lines: RateLine[] = [];
      let freight = 0;
      let ahs = 0;
      let large = 0;
      let kgTotal = 0;
      for (const p of parcels) {
        const kg = billableWeight(p.dims, p.weight) / 1000;
        kgTotal += p.weight / 1000;
        freight += (s.base + s.perKg * kg) * ZONE_MULT[z] * jitter;
        if (needsAdditionalHandling(p.dims, p.weight)) ahs += 2650;
        if (isLargePackage(p.dims)) large += 11_500;
      }
      freight = Math.round(freight);
      lines.push({ label: `Base freight · ${parcels.length} pc · zone ${z}`, cents: freight });
      if (ahs) lines.push({ label: "Additional handling", cents: ahs });
      if (large) lines.push({ label: "Large package", cents: large });
      if (req.destination.residential) lines.push({ label: "Residential delivery", cents: 525 * parcels.length });
      if (hasLive) lines.push({ label: "Live animal handling", cents: 1500 * parcels.filter((p) => p.handling === "live").length });
      const insured = Math.max(0, req.declaredValueCents - 10_000);
      if (insured > 0) lines.push({ label: "Declared value coverage", cents: Math.round((insured / 100) * 2.4) });
      const sub = lines.reduce((s, l) => s + l.cents, 0);
      lines.push({ label: `Fuel surcharge ${(FUEL.parcel * 100).toFixed(1)}%`, cents: Math.round(sub * FUEL.parcel) });
      // Express and overnight services are next-day (two days to the far zones), whatever the distance.
      const transit = s.speed <= 0.4 ? (z >= 7 ? 2 : 1) : Math.max(1, Math.round(groundDays * s.speed));
      const notes: string[] = [];
      if (hasLive) notes.push("Live-animal desk confirms booking; ships Mon–Wed only.");
      quotes.push({
        id: `${s.code}-${s.service.replace(/\W+/g, "").toLowerCase()}`,
        carrier: s.carrier,
        carrierCode: s.code,
        service: s.service,
        mode: "parcel",
        totalCents: lines.reduce((t, l) => t + l.cents, 0),
        lines,
        transitDays: transit,
        shipDate: shipDate.toISOString(),
        deliveryDate: addBusinessDays(shipDate, transit).toISOString(),
        guaranteed: s.guaranteed,
        // Air legs for express services roughly 2.6× the road footprint.
        co2Kg: Math.round(co2Parcel(kgTotal) * (s.speed < 0.5 ? 2.6 : 1) * 10) / 10,
        tags: [],
        notes,
      });
    }
  }

  if (pallets.length) {
    const parcelAddOn = parcels.length ? cheapestParcelOnly(req, z, jitterFor(req)) : 0;
    for (const c of LTL) {
      const jitter = 0.93 + seeded(c.code + req.destination.city) * 0.14;
      const lines: RateLine[] = [];
      let freight = 0;
      let kgTotal = 0;
      const classes: number[] = [];
      for (const p of pallets) {
        const cls = freightClass(p.dims, p.weight);
        classes.push(cls);
        kgTotal += p.weight / 1000;
        const cwt = p.weight / G_PER_LB / 100;
        freight += Math.max(c.min, (c.min * 0.45 + cwt * c.cwt * (cls / 100)) * ZONE_MULT[z]) * jitter;
      }
      freight = Math.round(freight);
      lines.push({ label: `Line haul · ${pallets.length} skid · class ${classes.join("/")}`, cents: freight });
      if (req.destination.residential) {
        lines.push({ label: "Residential delivery", cents: 9500 });
        lines.push({ label: "Tailgate / liftgate", cents: 8500 });
        lines.push({ label: "Delivery appointment", cents: 3500 });
      }
      const sub = lines.reduce((s, l) => s + l.cents, 0);
      lines.push({ label: `Fuel surcharge ${(FUEL.ltl * 100).toFixed(1)}%`, cents: Math.round(sub * FUEL.ltl) });
      const notes: string[] = [];
      if (parcelAddOn) {
        lines.push({ label: "Courier add-on for temperature-controlled box", cents: parcelAddOn });
        notes.push("Live/frozen shipper travels separately by overnight courier.");
      }
      const transit = Math.max(2, Math.round(groundDays * c.speed + 1));
      quotes.push({
        id: `${c.code}-ltl`,
        carrier: c.carrier,
        carrierCode: c.code,
        service: c.service,
        mode: "ltl",
        totalCents: lines.reduce((t, l) => t + l.cents, 0),
        lines,
        transitDays: transit,
        shipDate: today.toISOString(),
        deliveryDate: addBusinessDays(today, transit).toISOString(),
        guaranteed: c.guaranteed,
        co2Kg: co2Ltl(kgTotal),
        tags: [],
        notes,
      });
    }
  }

  if (!quotes.length) return quotes;
  const cheapest = quotes.reduce((a, b) => (b.totalCents < a.totalCents ? b : a));
  const fastest = quotes.reduce((a, b) => (b.transitDays < a.transitDays || (b.transitDays === a.transitDays && b.totalCents < a.totalCents) ? b : a));
  cheapest.tags.push("cheapest");
  fastest.tags.push("fastest");
  // Best value: price per day saved against the cheapest option, guaranteed services preferred.
  const value = (q: RateQuote) => q.totalCents * (1 + q.transitDays * 0.06) * (q.guaranteed ? 0.95 : 1);
  const best = [...quotes].sort((a, b) => value(a) - value(b))[0];
  if (best !== cheapest && best !== fastest) best.tags.push("best value");
  return quotes.sort((a, b) => a.totalCents - b.totalCents);
}

function jitterFor(req: RateRequest) {
  return 0.94 + seeded("addon" + req.destination.city) * 0.1;
}

/** Courier cost of the temperature-controlled boxes when the rest of the order rides LTL. */
function cheapestParcelOnly(req: RateRequest, z: number, jitter: number): number {
  const s = PARCEL.find((p) => p.code === "PUR" && p.live)!;
  let c = 0;
  for (const p of req.pieces.filter((p) => p.kind === "parcel")) {
    const kg = billableWeight(p.dims, p.weight) / 1000;
    c += (s.base + s.perKg * kg) * ZONE_MULT[z] * jitter + (p.handling === "live" ? 1500 : 0);
  }
  return Math.round(c * (1 + FUEL.parcel));
}

/** Weather context shown with live shipments. */
export function liveShipAdvice(city: string, province: string) {
  const c = cityFor(city, province);
  const low = c ? novemberLow(c) : -5;
  return {
    low,
    // Reptiles want 22–28 °C in transit: heat below ~10 °C outside, cool above ~26 °C.
    pack: low < 10 ? (low < -10 ? "60-hour heat pack" : "40-hour heat pack") : low > 26 ? "cold pack" : "no pack needed",
  };
}

export function originLabel() {
  return `${ORIGIN.city}, ${ORIGIN.province}`;
}
