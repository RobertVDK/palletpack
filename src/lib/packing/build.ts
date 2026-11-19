import type { ContainerSpec, Handling, PackItem, Package, PackageFlag, Placement } from "./types";
import { COURIER_LIMITS, courierIssues, needsAdditionalHandling } from "./freight";

const vol = (d: { l: number; w: number; h: number }) => d.l * d.w * d.h;

/** Kraft void fill, bubble wrap and coolant weights added on top of the goods. */
export function dunnageFor(container: ContainerSpec, items: PackItem[]): number {
  const usable = vol(container.inner);
  const goods = items.reduce((s, i) => s + vol(i.dims), 0);
  const voidCm3 = Math.max(0, usable - goods) / 1000;
  const fill = voidCm3 * 0.012; // crumpled kraft ≈ 12 g per litre
  const wrap = items.filter((i) => i.fragile).length * 45;
  const coolant = container.insulated ? 450 : 0;
  return Math.round(fill + wrap + coolant);
}

function centreOfGravity(placements: Placement[], weightOf: (p: Placement) => number) {
  let m = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of placements) {
    const w = weightOf(p);
    m += w;
    x += (p.x + p.dx / 2) * w;
    y += (p.y + p.dy / 2) * w;
    z += (p.z + p.dz / 2) * w;
  }
  return m > 0 ? { x: x / m, y: y / m, z: z / m } : { x: 0, y: 0, z: 0 };
}

function flagsFor(items: PackItem[], handling: Handling, outer: { l: number; w: number; h: number }, gross: number) {
  const flags = new Set<PackageFlag>();
  if (items.some((i) => i.fragile)) flags.add("fragile");
  if (items.some((i) => i.keepUpright) || handling !== "standard") flags.add("keep-upright");
  if (handling === "live") flags.add("live");
  if (handling === "frozen") flags.add("frozen");
  if (gross > COURIER_LIMITS.ahsWeight) flags.add("heavy");
  if (needsAdditionalHandling(outer, gross) || courierIssues(outer, gross).length) flags.add("oversize");
  return [...flags];
}

export function boxPackage(
  id: string,
  container: ContainerSpec,
  placements: Placement[],
  itemsById: Record<string, PackItem>,
): Package {
  const items = placements.map((p) => itemsById[p.refId]);
  const contents = items.reduce((s, i) => s + i.weight, 0);
  const dunnage = dunnageFor(container, items);
  const gross = contents + container.tare + dunnage;
  const usable = vol(container.inner) - (container.coolant ?? 0) * container.inner.l * container.inner.w;
  const handling = items[0]?.handling ?? "standard";
  return {
    id,
    kind: "box",
    handling,
    container,
    placements: placements.map((p, i) => ({ ...p, step: i })),
    itemIds: items.map((i) => i.id),
    children: [],
    outer: { ...container.outer },
    contentsWeight: contents,
    dunnageWeight: dunnage,
    grossWeight: gross,
    fill: Math.min(1, items.reduce((s, i) => s + vol(i.dims), 0) / usable),
    cog: centreOfGravity(placements, (p) => itemsById[p.refId].weight),
    flags: flagsFor(items, handling, container.outer, gross),
  };
}

/** A unit that travels in its own retail carton, or that no stock box can hold. */
export function ownPackage(id: string, item: PackItem, noFit: boolean): Package {
  const corner = noFit ? 12 : 0; // corner boards / edge protection on bare items
  const outer = { l: item.dims.l + corner, w: item.dims.w + corner, h: item.dims.h + corner };
  const container: ContainerSpec = {
    id: noFit ? "as-is" : "own",
    name: noFit ? "As-is with edge protection" : "Ships in own box",
    kind: "box",
    inner: { ...item.dims },
    outer,
    tare: noFit ? 350 : 0,
    maxGross: 1e9,
    costCents: noFit ? 180 : 0,
    insulated: false,
    accepts: [item.handling],
    stock: 1e9,
  };
  const gross = item.weight + container.tare;
  const flags = flagsFor([item], item.handling, outer, gross);
  if (noFit) flags.push("no-fit");
  return {
    id,
    kind: "own",
    handling: item.handling,
    container,
    placements: [
      {
        refId: item.id,
        refKind: "item",
        x: corner / 2,
        y: corner / 2,
        z: corner / 2,
        dx: item.dims.l,
        dy: item.dims.w,
        dz: item.dims.h,
        orientation: 0,
        pad: 0,
        supportRatio: 1,
        step: 0,
      },
    ],
    itemIds: [item.id],
    children: [],
    outer,
    contentsWeight: item.weight,
    dunnageWeight: 0,
    grossWeight: gross,
    fill: 1,
    cog: { x: outer.l / 2, y: outer.w / 2, z: outer.h / 2 },
    flags,
  };
}

export function palletPackage(
  id: string,
  pallet: ContainerSpec,
  placements: Placement[],
  childrenById: Record<string, Package>,
): Package {
  const deck = pallet.deckHeight ?? 140;
  const children = placements.map((p) => childrenById[p.refId]);
  const loadTop = placements.reduce((m, p) => Math.max(m, p.z + p.dz), 0);
  const wrap = 1200; // stretch film + corner boards
  const contents = children.reduce((s, c) => s + c.grossWeight, 0);
  const gross = contents + pallet.tare + wrap;
  const outer = { l: pallet.outer.l, w: pallet.outer.w, h: Math.round(deck + loadTop + 6) };
  const items = children.flatMap((c) => c.itemIds);
  const cog = centreOfGravity(placements, (p) => childrenById[p.refId].grossWeight);
  const flags = new Set<PackageFlag>();
  if (children.some((c) => c.flags.includes("fragile"))) flags.add("fragile");
  flags.add("keep-upright");
  const offX = Math.abs(cog.x - pallet.inner.l / 2) / pallet.inner.l;
  const offY = Math.abs(cog.y - pallet.inner.w / 2) / pallet.inner.w;
  if (offX > 0.12 || offY > 0.12) flags.add("off-center");
  return {
    id,
    kind: "pallet",
    handling: "standard",
    container: pallet,
    placements: placements.map((p, i) => ({ ...p, step: i })),
    itemIds: items,
    children,
    outer,
    contentsWeight: contents,
    dunnageWeight: wrap,
    grossWeight: gross,
    fill: Math.min(1, children.reduce((s, c) => s + vol(c.outer), 0) / (pallet.inner.l * pallet.inner.w * Math.max(loadTop, 1))),
    cog: { ...cog, z: cog.z + deck },
    flags: [...flags],
  };
}
