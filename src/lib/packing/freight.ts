import type { Dims, Package } from "./types";

// Shared freight math used by the packer's objective and by the rate engine.

export const DIM_DIVISOR_CM = 5000; // cm³ per kg, Canadian courier standard
export const MM_PER_IN = 25.4;
export const G_PER_LB = 453.59237;

export const COURIER_LIMITS = {
  maxGross: 31_750, // 70 lb
  maxLength: 2740, // 108"
  maxLengthPlusGirth: 4190, // 165"
  /** Additional handling: longest side > 48" or second side > 30" or > 50 lb. */
  ahsLength: 1219,
  ahsSecond: 762,
  ahsWeight: 22_680,
  /** Large package: length + girth > 130". */
  largeGirth: 3302,
};

export function sortedSides(d: Dims): [number, number, number] {
  const s = [d.l, d.w, d.h].sort((a, b) => b - a);
  return [s[0], s[1], s[2]];
}

export function lengthPlusGirth(d: Dims): number {
  const [a, b, c] = sortedSides(d);
  return a + 2 * (b + c);
}

/** Dimensional weight in grams. */
export function dimWeight(d: Dims): number {
  return ((d.l / 10) * (d.w / 10) * (d.h / 10) * 1000) / DIM_DIVISOR_CM;
}

/** Billable weight in grams, rounded up to the next half kilo like carriers do. */
export function billableWeight(d: Dims, gross: number): number {
  const g = Math.max(gross, dimWeight(d));
  return Math.ceil(g / 500) * 500;
}

export type CourierIssue = "overweight" | "overlength" | "overgirth";

export function courierIssues(d: Dims, gross: number): CourierIssue[] {
  const out: CourierIssue[] = [];
  if (gross > COURIER_LIMITS.maxGross) out.push("overweight");
  const [a] = sortedSides(d);
  if (a > COURIER_LIMITS.maxLength) out.push("overlength");
  if (lengthPlusGirth(d) > COURIER_LIMITS.maxLengthPlusGirth) out.push("overgirth");
  return out;
}

export function needsAdditionalHandling(d: Dims, gross: number): boolean {
  const [a, b] = sortedSides(d);
  return a > COURIER_LIMITS.ahsLength || b > COURIER_LIMITS.ahsSecond || gross > COURIER_LIMITS.ahsWeight;
}

export function isLargePackage(d: Dims): boolean {
  return lengthPlusGirth(d) > COURIER_LIMITS.largeGirth;
}

/** Density in lb/ft³ – what LTL carriers classify on. */
export function densityPcf(d: Dims, gross: number): number {
  const ft3 = (d.l / MM_PER_IN) * (d.w / MM_PER_IN) * (d.h / MM_PER_IN) / 1728;
  return gross / G_PER_LB / ft3;
}

const CLASS_TABLE: [number, number][] = [
  [50, 50],
  [35, 55],
  [30, 60],
  [22.5, 65],
  [15, 70],
  [13.5, 77.5],
  [12, 85],
  [10.5, 92.5],
  [9, 100],
  [8, 110],
  [7, 125],
  [6, 150],
  [5, 175],
  [4, 200],
  [3, 250],
  [2, 300],
  [1, 400],
];

/** NMFC density-based freight class. */
export function freightClass(d: Dims, gross: number): number {
  const pcf = densityPcf(d, gross);
  for (const [min, cls] of CLASS_TABLE) if (pcf >= min) return cls;
  return 500;
}

/** Planning estimate for one parcel (cents). The rate engine quotes real-looking carrier prices later. */
export function estimateParcelCents(d: Dims, gross: number): number {
  const kg = billableWeight(d, gross) / 1000;
  let c = 1150 + 165 * kg;
  if (needsAdditionalHandling(d, gross)) c += 2400;
  if (isLargePackage(d)) c += 9500;
  if (courierIssues(d, gross).length) c += 25_000; // effectively forbids it
  return Math.round(c);
}

/** Planning estimate for one skid (cents). */
export function estimateSkidCents(d: Dims, gross: number): number {
  const cls = freightClass(d, gross);
  const cwt = Math.max(1, gross / G_PER_LB / 100);
  const c = (9500 + cwt * 2200 * (cls / 100)) * 1.28;
  return Math.round(Math.max(c, 17_500));
}

export function estimatePackageCents(p: Package): number {
  return p.kind === "pallet" ? estimateSkidCents(p.outer, p.grossWeight) : estimateParcelCents(p.outer, p.grossWeight);
}
