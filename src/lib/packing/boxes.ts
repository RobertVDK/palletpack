import { fitsSomehow, packSpace, type Packable, type SpaceSpec } from "./extreme-point";
import { boxPackage, ownPackage } from "./build";
import { estimateParcelCents } from "./freight";
import type { ContainerSpec, Handling, PackItem, Package, PackOptions, PlanNote, Placement } from "./types";

// Chooses which stock boxes to use and what goes in each.
// Objective: lowest (box cost + estimated postage), which makes dimensional weight count.

const vol = (d: { l: number; w: number; h: number }) => d.l * d.w * d.h;

type Ordering = { name: string; key: (a: PackItem, b: PackItem) => number };

const maxSide = (i: PackItem) => Math.max(i.dims.l, i.dims.w, i.dims.h);
const base = (i: PackItem) => i.dims.l * i.dims.w;

// Fragile units always go last so they end up on top; heavy units first within ties.
const fragileLast = (a: PackItem, b: PackItem) => Number(a.fragile) - Number(b.fragile);

export const ORDERINGS: Ordering[] = [
  { name: "volume", key: (a, b) => fragileLast(a, b) || vol(b.dims) - vol(a.dims) || b.weight - a.weight },
  { name: "longest side", key: (a, b) => fragileLast(a, b) || maxSide(b) - maxSide(a) || vol(b.dims) - vol(a.dims) },
  { name: "footprint", key: (a, b) => fragileLast(a, b) || base(b) - base(a) || b.dims.h - a.dims.h },
  { name: "height", key: (a, b) => fragileLast(a, b) || b.dims.h - a.dims.h || base(b) - base(a) },
  { name: "weight", key: (a, b) => fragileLast(a, b) || b.weight - a.weight || vol(b.dims) - vol(a.dims) },
];

export interface BoxSolveStats {
  tried: number;
  layouts: number;
}

interface Candidate {
  box: ContainerSpec;
  placements: Placement[];
  leftover: PackItem[];
  cost: number;
  packedVol: number;
}

function spaceFor(box: ContainerSpec): SpaceSpec {
  return {
    inner: { ...box.inner, h: box.inner.h - (box.coolant ?? 0) },
    maxPayload: box.maxGross - box.tare,
    minSupport: 0,
  };
}

function toPackable(i: PackItem, opts: PackOptions): Packable {
  return {
    id: i.id,
    dims: i.dims,
    weight: i.weight,
    keepUpright: i.keepUpright,
    maxLoad: i.maxLoad,
    pad: i.fragile ? opts.fragilePad : 0,
  };
}

export function packageCost(box: ContainerSpec, placements: Placement[], itemsById: Record<string, PackItem>): number {
  const pkg = boxPackage("tmp", box, placements, itemsById);
  return box.costCents + estimateParcelCents(pkg.outer, pkg.grossWeight);
}

/** Layout evaluations allowed per group before the search falls back to plain greedy. */
const LAYOUT_BUDGET = 900;

function tryBox(
  box: ContainerSpec,
  remaining: PackItem[],
  itemsById: Record<string, PackItem>,
  opts: PackOptions,
  stats: BoxSolveStats,
  memo: Map<string, Candidate[]>,
): Candidate[] {
  const memoKey = `${box.id}:${remaining.map((i) => i.id).sort().join(",")}`;
  const hit = memo.get(memoKey);
  if (hit) return hit;
  const space = spaceFor(box);
  const space2: SpaceSpec = { ...space, minSupport: opts.minSupportBox };
  if (!remaining.some((i) => fitsSomehow(toPackable(i, opts), space.inner))) {
    memo.set(memoKey, []);
    return [];
  }
  // Skip boxes far too small to matter for a big remainder.
  const remVol = remaining.reduce((s, i) => s + vol(i.dims), 0);
  if (remaining.length > 6 && vol(space.inner) < remVol * 0.08) {
    memo.set(memoKey, []);
    return [];
  }
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const orderings = stats.layouts > LAYOUT_BUDGET ? ORDERINGS.slice(0, 2) : ORDERINGS;
  for (const ord of orderings) {
    const sorted = [...remaining].sort(ord.key);
    const res = packSpace(sorted.map((i) => toPackable(i, opts)), space2);
    stats.tried += res.evaluated;
    stats.layouts++;
    if (!res.placements.length) continue;
    const sig = res.placements.map((p) => p.refId).sort().join(",");
    if (seen.has(sig)) continue;
    seen.add(sig);
    const leftoverIds = new Set(res.leftover.map((l) => l.id));
    out.push({
      box,
      placements: res.placements,
      leftover: remaining.filter((i) => leftoverIds.has(i.id)),
      cost: packageCost(box, res.placements, itemsById),
      packedVol: res.placements.reduce((s, p) => s + vol(itemsById[p.refId].dims), 0),
    });
  }
  memo.set(memoKey, out);
  return out;
}

/**
 * Selection bias (not real cost): keep specialty shapes (long, flat) for the items that need them,
 * and lean away from boxes that are low on the shelf.
 */
function preference(c: Candidate, itemsById: Record<string, PackItem>): number {
  const s = [c.box.inner.l, c.box.inner.w, c.box.inner.h].sort((a, b) => b - a);
  let f = 1;
  const specialty = s[0] / s[2] > 3.5;
  if (specialty) {
    const needsIt = c.placements.some((p) => {
      const d = itemsById[p.refId].dims;
      const longest = Math.max(d.l, d.w, d.h);
      const shortest = Math.min(d.l, d.w, d.h);
      return longest > s[0] * 0.55 || shortest < s[2] * 0.35;
    });
    if (!needsIt) f *= 1.35;
  }
  if (c.box.stock < 25) f *= 1.12;
  return f;
}

interface Solution {
  boxes: { box: ContainerSpec; placements: Placement[] }[];
  cost: number;
}

/** Cost-aware greedy with one-step lookahead on partial fills. */
function solve(
  remaining: PackItem[],
  boxes: ContainerSpec[],
  itemsById: Record<string, PackItem>,
  opts: PackOptions,
  stats: BoxSolveStats,
  depth: number,
  memo: Map<string, Candidate[]>,
): Solution {
  if (!remaining.length) return { boxes: [], cost: 0 };
  const candidates = boxes.flatMap((b) => tryBox(b, remaining, itemsById, opts, stats, memo));
  if (!candidates.length) return { boxes: [], cost: Infinity };

  const complete = candidates
    .filter((c) => c.leftover.length === 0)
    .sort((a, b) => a.cost * preference(a, itemsById) - b.cost * preference(b, itemsById) || vol(a.box.inner) - vol(b.box.inner));
  const partial = candidates
    .filter((c) => c.leftover.length > 0)
    .sort((a, b) => b.packedVol / (b.cost * preference(b, itemsById)) - a.packedVol / (a.cost * preference(a, itemsById)));

  let best: Solution | null = complete[0] ? { boxes: [{ box: complete[0].box, placements: complete[0].placements }], cost: complete[0].cost } : null;

  // Splitting can beat one big box (dim weight); explore the best few partial fills.
  const roomy = stats.layouts < LAYOUT_BUDGET;
  const branch = depth > 0 && roomy ? (remaining.length <= 16 ? 3 : remaining.length <= 40 ? 2 : 1) : 1;
  for (const c of partial.slice(0, branch)) {
    const rest = solve(c.leftover, boxes, itemsById, opts, stats, depth - 1, memo);
    const total = c.cost + rest.cost;
    if (!best || total < best.cost) best = { boxes: [{ box: c.box, placements: c.placements }, ...rest.boxes], cost: total };
  }
  return best ?? { boxes: [], cost: Infinity };
}

export interface BoxResult {
  packages: Package[];
  notes: PlanNote[];
  stats: BoxSolveStats;
}

const HANDLING_LABEL: Record<Handling, string> = { standard: "standard", live: "live", frozen: "frozen" };

export function packIntoBoxes(
  items: PackItem[],
  catalogue: ContainerSpec[],
  opts: PackOptions,
  nextId: (prefix: string) => string,
): BoxResult {
  const itemsById = Object.fromEntries(items.map((i) => [i.id, i]));
  const stats: BoxSolveStats = { tried: 0, layouts: 0 };
  const notes: PlanNote[] = [];
  const packages: Package[] = [];
  const boxes = catalogue.filter((b) => b.kind === "box" && b.stock > 0);

  const own = items.filter((i) => i.shipsInOwnBox);
  for (const i of own) packages.push(ownPackage(nextId("PKG"), i, false));
  if (own.length) notes.push({ level: "rule", text: `${own.length} unit${own.length > 1 ? "s ship" : " ships"} in the manufacturer's carton (no overbox).` });

  const groups: Handling[] = ["standard", "live", "frozen"];
  for (const handling of groups) {
    const group = items.filter((i) => !i.shipsInOwnBox && i.handling === handling);
    if (!group.length) continue;
    const eligible = boxes.filter((b) => b.accepts.includes(handling));
    if (handling !== "standard")
      notes.push({
        level: "rule",
        text:
          handling === "live"
            ? "Live goods are packed apart in insulated shippers with a heat pack – never mixed with dry goods or put on a skid."
            : "Frozen goods are packed apart in insulated shippers with gel packs.",
      });

    const fitsAny = (i: PackItem) => eligible.some((b) => fitsSomehow(toPackable(i, opts), spaceFor(b).inner) && i.weight <= b.maxGross - b.tare);
    const misfits = group.filter((i) => !fitsAny(i));
    for (const i of misfits) {
      packages.push(ownPackage(nextId("PKG"), i, true));
      notes.push({ level: "warn", text: `No ${HANDLING_LABEL[handling]} stock box fits “${i.name}” – it ships as-is with edge protection.` });
    }
    const packable = group.filter((i) => fitsAny(i));
    if (!packable.length) continue;

    const solution = solve(packable, eligible, itemsById, opts, stats, 2, new Map());
    for (const b of solution.boxes) packages.push(boxPackage(nextId("PKG"), b.box, b.placements, itemsById));

    // Safety net: anything the solver could not place goes as-is.
    const placed = new Set(solution.boxes.flatMap((b) => b.placements.map((p) => p.refId)));
    for (const i of packable.filter((i) => !placed.has(i.id))) {
      packages.push(ownPackage(nextId("PKG"), i, true));
      notes.push({ level: "warn", text: `Could not fit “${i.name}” with the rest – it ships separately.` });
    }
  }

  return { packages, notes, stats };
}
