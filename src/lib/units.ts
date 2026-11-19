export type Units = "imperial" | "metric";

const IN = 25.4;
const LB = 453.592;

export function len(mm: number, u: Units, digits?: number) {
  if (u === "metric") {
    const cm = mm / 10;
    return `${cm.toFixed(digits ?? (cm < 100 ? 1 : 0))}`;
  }
  // Tape-measure precision: quarters for summary readouts, eighths when more digits are asked for.
  const steps = digits !== undefined && digits <= 1 ? 4 : 8;
  const inch = Math.round((mm / IN) * steps) / steps;
  return `${Number(inch.toFixed(3))}`;
}

export function lenUnit(u: Units) {
  return u === "metric" ? "cm" : "in";
}

export function dims(d: { l: number; w: number; h: number }, u: Units) {
  return `${len(d.l, u, 1)} × ${len(d.w, u, 1)} × ${len(d.h, u, 1)} ${lenUnit(u)}`;
}

export function weight(g: number, u: Units) {
  if (u === "metric") return g >= 1000 ? `${(g / 1000).toFixed(g >= 100_000 ? 0 : 1)} kg` : `${Math.round(g)} g`;
  const lb = g / LB;
  return lb >= 1 ? `${lb.toFixed(lb >= 100 ? 0 : 1)} lb` : `${(lb * 16).toFixed(1)} oz`;
}

export function weightValue(g: number, u: Units) {
  return u === "metric" ? g / 1000 : g / LB;
}

export function weightUnit(u: Units) {
  return u === "metric" ? "kg" : "lb";
}

export function toGrams(v: number, u: Units) {
  return u === "metric" ? v * 1000 : v * LB;
}

export function toMm(v: number, u: Units) {
  return u === "metric" ? v * 10 : v * IN;
}

export function money(cents: number) {
  return (cents / 100).toLocaleString("en-CA", { style: "currency", currency: "CAD" });
}

export function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}
