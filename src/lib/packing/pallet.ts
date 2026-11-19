import { packSpace, type Packable } from "./extreme-point";
import { palletPackage } from "./build";
import type { ContainerSpec, Package, PackOptions, PlanNote, Placement } from "./types";

// Stacks cartons onto skids: heavy and wide at the bottom, fragile on top, every carton
// at least 75% supported, cartons kept upright, no overhang, height capped for LTL.

const CARTON_CRUSH = 140_000; // g a corrugated carton takes on its top (ECT-32 under load)
const FRAGILE_CRUSH = 25_000; // carton with wrapped fragile goods inside
const GLASS_CRUSH = 12_000; // bare maker's carton around a glass enclosure

type Ord = (a: Package, b: Package) => number;
const fragile = (p: Package) => Number(p.flags.includes("fragile"));
const footprint = (p: Package) => p.outer.l * p.outer.w;

const ORDERINGS: Ord[] = [
  (a, b) => fragile(a) - fragile(b) || b.grossWeight - a.grossWeight || footprint(b) - footprint(a),
  (a, b) => fragile(a) - fragile(b) || footprint(b) - footprint(a) || b.grossWeight - a.grossWeight,
  (a, b) => fragile(a) - fragile(b) || b.outer.h - a.outer.h || footprint(b) - footprint(a),
  (a, b) => fragile(a) - fragile(b) || b.outer.l * b.outer.w * b.outer.h - a.outer.l * a.outer.w * a.outer.h,
];

function toPackable(p: Package): Packable {
  return {
    id: p.id,
    dims: p.outer,
    weight: p.grossWeight,
    keepUpright: true,
    maxLoad: !p.flags.includes("fragile") ? CARTON_CRUSH : p.kind === "own" ? GLASS_CRUSH : FRAGILE_CRUSH,
    pad: 0,
  };
}

export interface PalletResult {
  pallets: Package[];
  loose: Package[];
  notes: PlanNote[];
  tried: number;
}

export function palletize(
  cartons: Package[],
  pallet: ContainerSpec,
  opts: PackOptions,
  nextId: (prefix: string) => string,
): PalletResult {
  const deck = pallet.deckHeight ?? 140;
  const space = {
    inner: { l: pallet.inner.l, w: pallet.inner.w, h: opts.palletMaxHeight - deck },
    maxPayload: pallet.maxGross - pallet.tare,
    minSupport: opts.minSupportPallet,
  };
  const byId = Object.fromEntries(cartons.map((c) => [c.id, c]));
  const notes: PlanNote[] = [];
  const pallets: Package[] = [];
  let tried = 0;

  const fits = (c: Package) => {
    const [a, b] = [c.outer.l, c.outer.w];
    const footOk = (a <= space.inner.l && b <= space.inner.w) || (b <= space.inner.l && a <= space.inner.w);
    return footOk && c.outer.h <= space.inner.h && c.grossWeight <= space.maxPayload;
  };
  const loose = cartons.filter((c) => !fits(c));
  for (const c of loose) notes.push({ level: "warn", text: `${c.id} is larger than the skid deck – it ships as its own freight piece.` });

  let remaining = cartons.filter(fits);
  while (remaining.length) {
    let best: { placements: Placement[]; leftover: string[]; top: number; offset: number; score: number } | null = null;
    for (const ord of ORDERINGS) {
      const res = packSpace([...remaining].sort(ord).map(toPackable), space);
      tried += res.evaluated;
      if (!res.placements.length) continue;
      const top = res.placements.reduce((m, p) => Math.max(m, p.z + p.dz), 0);
      // Balance: weighted centre's distance from the deck centre.
      let m = 0;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (const p of res.placements) {
        const w = byId[p.refId].grossWeight;
        m += w;
        cx += (p.x + p.dx / 2) * w;
        cy += (p.y + p.dy / 2) * w;
        cz += (p.z + p.dz / 2) * w;
      }
      const offset = Math.hypot(cx / m - space.inner.l / 2, cy / m - space.inner.w / 2);
      // Lower is better: short stack, centred, and a low centre of gravity (heavy cartons down).
      const score = top + offset * 0.5 + (cz / m) * 1.2;
      const cand = { placements: res.placements, leftover: res.leftover.map((l) => l.id), top, offset, score };
      if (!best || cand.leftover.length < best.leftover.length || (cand.leftover.length === best.leftover.length && cand.score < best.score))
        best = cand;
    }
    if (!best) {
      for (const id of remaining.map((r) => r.id)) loose.push(byId[id]);
      break;
    }
    const placements = best.placements.map((p) => ({ ...p, refKind: "package" as const }));
    pallets.push(palletPackage(nextId("SKID"), pallet, placements, byId));
    const left = new Set(best.leftover);
    remaining = remaining.filter((r) => left.has(r.id));
  }

  // Shift each load so its footprint is centred on the deck (cartons rarely fill 48×40 exactly).
  for (const s of pallets) {
    const maxX = s.placements.reduce((m, p) => Math.max(m, p.x + p.dx), 0);
    const maxY = s.placements.reduce((m, p) => Math.max(m, p.y + p.dy), 0);
    const ox = Math.floor((pallet.inner.l - maxX) / 2);
    const oy = Math.floor((pallet.inner.w - maxY) / 2);
    if (ox > 0 || oy > 0) {
      for (const p of s.placements) {
        p.x += ox;
        p.y += oy;
      }
      s.cog.x += ox;
      s.cog.y += oy;
      s.flags = s.flags.filter((f) => f !== "off-center");
      const offX = Math.abs(s.cog.x - pallet.inner.l / 2) / pallet.inner.l;
      const offY = Math.abs(s.cog.y - pallet.inner.w / 2) / pallet.inner.w;
      if (offX > 0.12 || offY > 0.12) s.flags.push("off-center");
    }
    if (s.flags.includes("off-center")) notes.push({ level: "warn", text: `${s.id} centre of gravity is off-centre – band it before wrapping.` });
  }

  return { pallets, loose, notes, tried };
}
