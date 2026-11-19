import type { ContainerSpec } from "@/lib/packing/types";

// The warehouse's stock cartons, insulated shippers and skid. Sizes are the inside
// dimensions the packer works with; outside adds single-wall board (¼") or EPS walls.

const IN = 25.4;
const LB = 453.592;

interface BoxDef {
  id: string;
  name: string;
  inner: [number, number, number];
  wall?: number;
  tareLb: number;
  maxLb: number;
  cents: number;
  stock: number;
  insulated?: boolean;
  coolant?: number;
}

const DEFS: BoxDef[] = [
  { id: "B-0906", name: "Mailer 9 × 6 × 3", inner: [9, 6, 3], tareLb: 0.3, maxLb: 20, cents: 52, stock: 640 },
  { id: "B-0606", name: "Cube 6", inner: [6, 6, 6], tareLb: 0.35, maxLb: 20, cents: 58, stock: 410 },
  { id: "B-1008", name: "Small 10 × 8 × 6", inner: [10, 8, 6], tareLb: 0.5, maxLb: 30, cents: 81, stock: 520 },
  { id: "B-1210", name: "Medium 12 × 10 × 8", inner: [12, 10, 8], tareLb: 0.75, maxLb: 40, cents: 108, stock: 380 },
  { id: "B-1212", name: "Cube 12", inner: [12, 12, 12], tareLb: 0.95, maxLb: 50, cents: 139, stock: 260 },
  { id: "B-1612", name: "Large 16 × 12 × 10", inner: [16, 12, 10], tareLb: 1.15, maxLb: 60, cents: 168, stock: 300 },
  { id: "B-1818", name: "X-Large 18 × 18 × 16", inner: [18, 18, 16], tareLb: 1.8, maxLb: 70, cents: 264, stock: 140 },
  { id: "B-2418", name: "XX-Large 24 × 18 × 18", inner: [24, 18, 18], tareLb: 2.45, maxLb: 70, cents: 342, stock: 90 },
  { id: "B-3808", name: "Long 38 × 8 × 8", inner: [38, 8, 8], tareLb: 1.2, maxLb: 30, cents: 214, stock: 7 },
  { id: "B-2016", name: "Flat 20 × 16 × 4", inner: [20, 16, 4], tareLb: 0.85, maxLb: 20, cents: 126, stock: 180 },
  { id: "I-1210", name: "Insulated live 10 × 8 × 8", inner: [10, 8, 8], wall: 1.25, tareLb: 1.5, maxLb: 20, cents: 945, stock: 64, insulated: true, coolant: 1 },
  { id: "I-1814", name: "Insulated large 16 × 12 × 10", inner: [16, 12, 10], wall: 1.25, tareLb: 2.9, maxLb: 40, cents: 1480, stock: 22, insulated: true, coolant: 1.25 },
];

/** Reorder point: below this the box shows as low on the box sizes page. */
export const REORDER_AT = 25;

export function defaultBoxes(): ContainerSpec[] {
  return DEFS.map((d) => {
    const wall = (d.wall ?? 0.125) * 2;
    return {
      id: d.id,
      name: d.name,
      kind: "box" as const,
      inner: { l: d.inner[0] * IN, w: d.inner[1] * IN, h: d.inner[2] * IN },
      outer: { l: (d.inner[0] + wall) * IN, w: (d.inner[1] + wall) * IN, h: (d.inner[2] + wall) * IN },
      tare: Math.round(d.tareLb * LB),
      maxGross: Math.round(d.maxLb * LB),
      costCents: d.cents,
      insulated: !!d.insulated,
      accepts: d.insulated ? (["live", "frozen"] as const).slice() : (["standard"] as const).slice(),
      stock: d.stock,
      coolant: d.coolant ? d.coolant * IN : undefined,
    };
  });
}

export function defaultPallet(): ContainerSpec {
  return {
    id: "SKID-4840",
    name: "GMA skid 48 × 40",
    kind: "pallet",
    inner: { l: 48 * IN, w: 40 * IN, h: 0 },
    outer: { l: 48 * IN, w: 40 * IN, h: 5.5 * IN },
    deckHeight: 5.5 * IN,
    tare: Math.round(42 * LB),
    maxGross: Math.round(2500 * LB),
    costCents: 1650,
    insulated: false,
    accepts: ["standard"],
    stock: 34,
  };
}
