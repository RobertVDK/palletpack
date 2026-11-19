import type { Dims, Placement } from "./types";

// Extreme-point 3D packing (after Crainic, Perboli & Tadei 2008) with gravity:
// every placement must rest on the floor or on enough of the tops below it, and
// nothing may load an item past what its top face can carry.

const EPS = 0.5;

export interface Packable {
  id: string;
  dims: Dims;
  weight: number;
  keepUpright: boolean;
  /** Grams the top face can carry. */
  maxLoad: number;
  /** Protective wrap per side (mm), added to the envelope. */
  pad: number;
}

export interface SpaceSpec {
  inner: Dims;
  /** Payload limit (g). */
  maxPayload: number;
  minSupport: number;
}

export interface PackResult {
  placements: Placement[];
  leftover: Packable[];
  payload: number;
  evaluated: number;
}

interface Box {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
}

interface Placed extends Box {
  item: Packable;
  load: number;
}

type Point = [number, number, number];

/** The six axis-aligned orientations; the first two keep the item's height vertical. */
export function orientations(d: Dims, upright: boolean): [number, number, number, number][] {
  const all: [number, number, number, number][] = [
    [d.l, d.w, d.h, 0],
    [d.w, d.l, d.h, 1],
    [d.l, d.h, d.w, 2],
    [d.h, d.l, d.w, 3],
    [d.w, d.h, d.l, 4],
    [d.h, d.w, d.l, 5],
  ];
  const list = upright ? all.slice(0, 2) : all;
  // Drop duplicates (cubes, square bases) so we don't evaluate the same shape twice.
  const seen = new Set<string>();
  return list.filter(([a, b, c]) => {
    const k = `${a}|${b}|${c}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** True when the item fits the space in at least one allowed orientation. */
export function fitsSomehow(item: Packable, inner: Dims): boolean {
  const p = item.pad * 2;
  return orientations(item.dims, item.keepUpright).some(
    ([a, b, c]) => a + p <= inner.l + EPS && b + p <= inner.w + EPS && c + p <= inner.h + EPS,
  );
}

const overlap1 = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

function intersects(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.dx - EPS &&
    a.x + a.dx > b.x + EPS &&
    a.y < b.y + b.dy - EPS &&
    a.y + a.dy > b.y + EPS &&
    a.z < b.z + b.dz - EPS &&
    a.z + a.dz > b.z + EPS
  );
}

/** Highest top surface under the footprint [x0,x1]×[y0,y1] at or below z. */
function dropZ(placed: Placed[], x0: number, x1: number, y0: number, y1: number, z: number): number {
  let best = 0;
  for (const p of placed) {
    const top = p.z + p.dz;
    if (top > z + EPS) continue;
    if (overlap1(x0, x1, p.x, p.x + p.dx) > EPS && overlap1(y0, y1, p.y, p.y + p.dy) > EPS) best = Math.max(best, top);
  }
  return best;
}

/** Slide a point toward the origin along one axis until it meets an obstacle or wall. */
function slide(placed: Placed[], pt: Point, axis: 0 | 1): Point {
  const [x, y, z] = pt;
  let limit = 0;
  for (const p of placed) {
    if (z < p.z - EPS || z >= p.z + p.dz - EPS) continue;
    if (axis === 0) {
      if (y < p.y - EPS || y >= p.y + p.dy - EPS) continue;
      const face = p.x + p.dx;
      if (face <= x + EPS) limit = Math.max(limit, face);
    } else {
      if (x < p.x - EPS || x >= p.x + p.dx - EPS) continue;
      const face = p.y + p.dy;
      if (face <= y + EPS) limit = Math.max(limit, face);
    }
  }
  return axis === 0 ? [limit, y, z] : [x, limit, z];
}

function insideSomething(placed: Placed[], [x, y, z]: Point): boolean {
  return placed.some(
    (p) =>
      x >= p.x - EPS && x < p.x + p.dx - EPS && y >= p.y - EPS && y < p.y + p.dy - EPS && z >= p.z - EPS && z < p.z + p.dz - EPS,
  );
}

/**
 * Packs items (in the given order) into one space. Items that cannot be placed come back in `leftover`.
 * Candidate scoring favours low, back-left, flat placements that touch walls and neighbours.
 */
export function packSpace(items: Packable[], space: SpaceSpec): PackResult {
  const { inner } = space;
  const placed: Placed[] = [];
  const placements: Placement[] = [];
  const leftover: Packable[] = [];
  let points: Point[] = [[0, 0, 0]];
  let payload = 0;
  let evaluated = 0;

  for (const item of items) {
    if (payload + item.weight > space.maxPayload) {
      leftover.push(item);
      continue;
    }
    const pad2 = item.pad * 2;
    let best: { box: Box; score: number; orient: number; support: number; supporters: [Placed, number][] } | null = null;

    for (const [px, py, pz] of points) {
      for (const [a, b, c, orient] of orientations(item.dims, item.keepUpright)) {
        const box: Box = { x: px, y: py, z: pz, dx: a + pad2, dy: b + pad2, dz: c + pad2 };
        if (box.x + box.dx > inner.l + EPS || box.y + box.dy > inner.w + EPS || box.z + box.dz > inner.h + EPS) continue;
        evaluated++;

        let clash = false;
        for (const p of placed) {
          if (intersects(box, p)) {
            clash = true;
            break;
          }
        }
        if (clash) continue;

        // Gravity: share of the base resting on the floor or on tops exactly at z.
        let support = 1;
        const supporters: [Placed, number][] = [];
        if (box.z > EPS) {
          const base = box.dx * box.dy;
          let area = 0;
          for (const p of placed) {
            if (Math.abs(p.z + p.dz - box.z) > EPS) continue;
            const ov = overlap1(box.x, box.x + box.dx, p.x, p.x + p.dx) * overlap1(box.y, box.y + box.dy, p.y, p.y + p.dy);
            if (ov > EPS) {
              area += ov;
              supporters.push([p, ov]);
            }
          }
          support = area / base;
          if (support < space.minSupport) continue;
          // Load bearing: spread this item's weight over its supporters by contact area.
          let crush = false;
          for (const [p, ov] of supporters) {
            if (p.load + item.weight * (ov / area) > p.item.maxLoad) {
              crush = true;
              break;
            }
          }
          if (crush) continue;
        }

        // Contact with walls and neighbours (perimeter touching), normalised.
        let contact = 0;
        if (box.x < EPS) contact += box.dy * box.dz;
        if (box.y < EPS) contact += box.dx * box.dz;
        if (box.x + box.dx > inner.l - EPS) contact += box.dy * box.dz;
        if (box.y + box.dy > inner.w - EPS) contact += box.dx * box.dz;
        for (const p of placed) {
          if (Math.abs(p.x + p.dx - box.x) < EPS || Math.abs(box.x + box.dx - p.x) < EPS)
            contact += overlap1(box.y, box.y + box.dy, p.y, p.y + p.dy) * overlap1(box.z, box.z + box.dz, p.z, p.z + p.dz);
          if (Math.abs(p.y + p.dy - box.y) < EPS || Math.abs(box.y + box.dy - p.y) < EPS)
            contact += overlap1(box.x, box.x + box.dx, p.x, p.x + p.dx) * overlap1(box.z, box.z + box.dz, p.z, p.z + p.dz);
        }
        const sideArea = 2 * (box.dx * box.dz + box.dy * box.dz);
        const contactRatio = sideArea > 0 ? contact / sideArea : 0;

        const score =
          (box.z / inner.h) * 60 +
          ((box.z + box.dz) / inner.h) * 25 +
          (box.x / inner.l) * 8 +
          (box.y / inner.w) * 8 -
          contactRatio * 20 -
          support * 6;

        if (!best || score < best.score - 1e-9) best = { box, score, orient, support, supporters };
      }
    }

    if (!best) {
      leftover.push(item);
      continue;
    }

    const { box, orient, support, supporters } = best;
    const totalArea = supporters.reduce((s, [, ov]) => s + ov, 0);
    for (const [p, ov] of supporters) p.load += item.weight * (ov / (totalArea || 1));
    placed.push({ ...box, item, load: 0 });
    payload += item.weight;
    placements.push({
      refId: item.id,
      refKind: "item",
      x: box.x,
      y: box.y,
      z: box.z,
      dx: box.dx,
      dy: box.dy,
      dz: box.dz,
      orientation: orient,
      pad: item.pad,
      supportRatio: support,
      step: placements.length,
    });

    // New extreme points: right, front and top of the placed box, settled by gravity and slid back.
    const fresh: Point[] = [];
    const right: Point = [box.x + box.dx, box.y, box.z];
    const front: Point = [box.x, box.y + box.dy, box.z];
    const top: Point = [box.x, box.y, box.z + box.dz];
    fresh.push(right, front, top);
    fresh.push([right[0], right[1], dropZ(placed, right[0], right[0] + 1, right[1], right[1] + 1, right[2])]);
    fresh.push([front[0], front[1], dropZ(placed, front[0], front[0] + 1, front[1], front[1] + 1, front[2])]);
    fresh.push(slide(placed, right, 1), slide(placed, front, 0));
    fresh.push(slide(placed, top, 0), slide(placed, top, 1), slide(placed, slide(placed, top, 0), 1));

    const merged = [...points, ...fresh].filter(
      ([x, y, z]) => x < inner.l - EPS && y < inner.w - EPS && z < inner.h - EPS && !insideSomething(placed, [x, y, z]),
    );
    const seen = new Set<string>();
    points = merged
      .filter(([x, y, z]) => {
        const k = `${Math.round(x)}|${Math.round(y)}|${Math.round(z)}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  }

  return { placements, leftover, payload, evaluated };
}
