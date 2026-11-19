import { packIntoBoxes } from "./boxes";
import { courierIssues, estimatePackageCents } from "./freight";
import { palletize } from "./pallet";
import {
  DEFAULT_OPTIONS,
  type ContainerSpec,
  type PackItem,
  type Package,
  type PackOptions,
  type PackPlan,
  type PlanMetrics,
  type PlanMode,
  type PlanNote,
} from "./types";

const vol = (d: { l: number; w: number; h: number }) => d.l * d.w * d.h;

function idFactory() {
  const n: Record<string, number> = {};
  return (prefix: string) => {
    n[prefix] = (n[prefix] ?? 0) + 1;
    return `${prefix}-${n[prefix]}`;
  };
}

function metricsFor(packages: Package[], items: PackItem[], tried: number, t0: number): PlanMetrics {
  const parcels = packages.filter((p) => p.kind !== "pallet");
  const pallets = packages.filter((p) => p.kind === "pallet");
  const boxesUsed = [...parcels, ...pallets.flatMap((p) => p.children)];
  const fillable = packages.filter((p) => p.kind !== "own");
  return {
    units: items.length,
    parcels: parcels.length,
    pallets: pallets.length,
    grossWeight: packages.reduce((s, p) => s + p.grossWeight, 0),
    shippedVolume: packages.reduce((s, p) => s + vol(p.outer), 0),
    itemVolume: items.reduce((s, i) => s + vol(i.dims), 0),
    avgFill: fillable.length ? fillable.reduce((s, p) => s + p.fill, 0) / fillable.length : 1,
    boxCostCents: boxesUsed.reduce((s, p) => s + p.container.costCents, 0) + pallets.reduce((s, p) => s + p.container.costCents, 0),
    estShipCents: packages.reduce((s, p) => s + estimatePackageCents(p), 0),
    candidatesTried: tried,
    computeMs: Math.round((performance.now() - t0) * 10) / 10,
  };
}

export function planBoxes(items: PackItem[], catalogue: ContainerSpec[], opts: PackOptions = DEFAULT_OPTIONS): PackPlan {
  const t0 = performance.now();
  const nextId = idFactory();
  const { packages, notes, stats } = packIntoBoxes(items, catalogue, opts, nextId);
  for (const p of packages) {
    const issues = courierIssues(p.outer, p.grossWeight);
    if (issues.length)
      notes.push({ level: "warn", text: `${p.id} is over courier limits (${issues.join(", ")}) – it has to go LTL.` });
  }
  return {
    mode: "boxes",
    packages,
    items: Object.fromEntries(items.map((i) => [i.id, i])),
    notes,
    metrics: metricsFor(packages, items, stats.tried, t0),
  };
}

export function planSkid(
  items: PackItem[],
  catalogue: ContainerSpec[],
  pallet: ContainerSpec,
  opts: PackOptions = DEFAULT_OPTIONS,
): PackPlan {
  const t0 = performance.now();
  const nextId = idFactory();
  const boxed = packIntoBoxes(items, catalogue, opts, nextId);
  const notes: PlanNote[] = [...boxed.notes];
  // Live and frozen shippers ride with couriers on expedited service, never on a skid.
  const parcelOnly = boxed.packages.filter((p) => p.handling !== "standard");
  const forSkid = boxed.packages.filter((p) => p.handling === "standard");
  if (parcelOnly.length)
    notes.push({ level: "rule", text: `${parcelOnly.length} temperature-controlled shipper${parcelOnly.length > 1 ? "s stay" : " stays"} on courier service.` });
  const res = palletize(forSkid, pallet, opts, nextId);
  notes.push(...res.notes);
  // A near-empty extra skid is rarely worth it: send its cartons by courier when that's cheaper.
  const keep: Package[] = [];
  for (const [i, s] of res.pallets.entries()) {
    const parcelsCost = s.children.reduce((t, c) => t + estimatePackageCents(c), 0);
    const ok = s.children.every((c) => courierIssues(c.outer, c.grossWeight).length === 0);
    if (i > 0 && ok && s.children.length <= 4 && parcelsCost < estimatePackageCents(s)) {
      res.loose.push(...s.children);
      notes.push({ level: "info", text: `${s.children.map((c) => c.id).join(", ")} ride${s.children.length > 1 ? "" : "s"} parcel – cheaper than a second skid.` });
    } else keep.push(s);
  }
  res.pallets = keep;
  const packages = [...res.pallets, ...res.loose, ...parcelOnly];
  if (res.pallets.length)
    notes.unshift({
      level: "info",
      text: `${forSkid.length - res.loose.length} cartons stacked on ${res.pallets.length} skid${res.pallets.length > 1 ? "s" : ""}, heaviest first, fragile on top.`,
    });
  return {
    mode: "skid",
    packages,
    items: Object.fromEntries(items.map((i) => [i.id, i])),
    notes,
    metrics: metricsFor(packages, items, boxed.stats.tried + res.tried, t0),
  };
}

export interface Recommendation {
  recommended: PlanMode;
  boxes: PackPlan;
  skid: PackPlan;
  reasons: string[];
  savingsCents: number;
}

export function recommend(
  items: PackItem[],
  catalogue: ContainerSpec[],
  pallet: ContainerSpec,
  opts: PackOptions = DEFAULT_OPTIONS,
): Recommendation {
  const boxes = planBoxes(items, catalogue, opts);
  const skid = planSkid(items, catalogue, pallet, opts);
  const reasons: string[] = [];
  const boxTotal = boxes.metrics.estShipCents + boxes.metrics.boxCostCents;
  const skidTotal = skid.metrics.estShipCents + skid.metrics.boxCostCents;
  const overLimit = boxes.packages.some((p) => courierIssues(p.outer, p.grossWeight).length > 0);

  let recommended: PlanMode;
  if (skid.metrics.pallets === 0) {
    recommended = "boxes";
    reasons.push("Nothing in this order can go on a skid.");
  } else if (overLimit) {
    recommended = "skid";
    reasons.push("At least one carton is over courier size or weight limits.");
  } else if (boxes.metrics.parcels <= 2 && boxes.metrics.grossWeight < 45_000) {
    recommended = boxTotal <= skidTotal ? "boxes" : "skid";
    reasons.push(`Small order: ${boxes.metrics.parcels} parcel${boxes.metrics.parcels > 1 ? "s" : ""} under 100 lb.`);
  } else {
    recommended = skidTotal < boxTotal ? "skid" : "boxes";
  }
  const savingsCents = Math.abs(boxTotal - skidTotal);
  reasons.push(
    recommended === "skid"
      ? `LTL on ${skid.metrics.pallets} skid${skid.metrics.pallets > 1 ? "s" : ""} is about $${(savingsCents / 100).toFixed(0)} cheaper than ${boxes.metrics.parcels} parcels.`
      : `Parcel is about $${(savingsCents / 100).toFixed(0)} cheaper than a skid minimum charge.`,
  );
  if (boxes.metrics.parcels >= 6) reasons.push(`${boxes.metrics.parcels} parcels means ${boxes.metrics.parcels} labels and more chances of a split delivery.`);
  return { recommended, boxes, skid, reasons, savingsCents };
}
