import { describe, expect, it } from "vitest";
import { defaultBoxes, defaultPallet } from "@/lib/catalogue/boxes";
import { packSpace } from "./extreme-point";
import { freightClass, billableWeight } from "./freight";
import { planBoxes, planSkid, recommend } from "./plan";
import { DEFAULT_OPTIONS, type PackItem, type Package, type Placement } from "./types";

const IN = 25.4;
let seq = 0;
function item(l: number, w: number, h: number, lb: number, extra: Partial<PackItem> = {}): PackItem {
  seq++;
  return {
    id: `i${seq}`,
    sku: `SKU${seq}`,
    productId: `p${seq}`,
    name: `Item ${seq}`,
    dims: { l: l * IN, w: w * IN, h: h * IN },
    weight: lb * 453.592,
    handling: "standard",
    fragile: false,
    keepUpright: false,
    maxLoad: 40 * 453.592,
    shipsInOwnBox: false,
    color: "#999",
    ...extra,
  };
}
const many = (n: number, f: () => PackItem) => Array.from({ length: n }, f);

function overlaps(a: Placement, b: Placement) {
  const e = 0.5;
  return a.x < b.x + b.dx - e && a.x + a.dx > b.x + e && a.y < b.y + b.dy - e && a.y + a.dy > b.y + e && a.z < b.z + b.dz - e && a.z + a.dz > b.z + e;
}

function assertGeometry(p: Package, opts = DEFAULT_OPTIONS) {
  const inner = p.kind === "pallet" ? { l: p.container.inner.l, w: p.container.inner.w, h: opts.palletMaxHeight - (p.container.deckHeight ?? 0) } : p.container.inner;
  for (const a of p.placements) {
    expect(a.x).toBeGreaterThanOrEqual(-0.5);
    expect(a.y).toBeGreaterThanOrEqual(-0.5);
    expect(a.z).toBeGreaterThanOrEqual(-0.5);
    expect(a.x + a.dx).toBeLessThanOrEqual(inner.l + 0.5);
    expect(a.y + a.dy).toBeLessThanOrEqual(inner.w + 0.5);
    expect(a.z + a.dz).toBeLessThanOrEqual(inner.h + 0.5);
    for (const b of p.placements) if (a !== b) expect(overlaps(a, b)).toBe(false);
  }
}

describe("extreme-point packer", () => {
  it("fills a box with identical cubes exactly", () => {
    const items = many(8, () => item(5, 5, 5, 1)).map((i) => ({ ...i, pad: 0 }));
    const res = packSpace(items, { inner: { l: 10 * IN, w: 10 * IN, h: 10 * IN }, maxPayload: 1e9, minSupport: 0.6 });
    expect(res.leftover).toHaveLength(0);
    expect(res.placements).toHaveLength(8);
  });

  it("never floats an item: every placement above the floor is supported", () => {
    const items = [item(10, 10, 4, 3), item(4, 4, 8, 1), item(6, 6, 2, 1), item(8, 3, 3, 1)].map((i) => ({ ...i, pad: 0 }));
    const res = packSpace(items, { inner: { l: 12 * IN, w: 10 * IN, h: 12 * IN }, maxPayload: 1e9, minSupport: 0.6 });
    for (const p of res.placements) if (p.z > 0.5) expect(p.supportRatio).toBeGreaterThanOrEqual(0.6);
  });

  it("respects keep-upright", () => {
    const tall = { ...item(3, 3, 9, 1, { keepUpright: true }), pad: 0 };
    // Only fits lying down: upright must refuse it.
    const res = packSpace([tall], { inner: { l: 10 * IN, w: 4 * IN, h: 4 * IN }, maxPayload: 1e9, minSupport: 0.6 });
    expect(res.placements).toHaveLength(0);
    const free = { ...item(3, 3, 9, 1), pad: 0 };
    expect(packSpace([free], { inner: { l: 10 * IN, w: 4 * IN, h: 4 * IN }, maxPayload: 1e9, minSupport: 0.6 }).placements).toHaveLength(1);
  });

  it("will not crush a fragile item", () => {
    const glass = { ...item(10, 10, 3, 1, { maxLoad: 500 }), pad: 0 };
    const brick = { ...item(10, 10, 3, 10), pad: 0 };
    const res = packSpace([glass, brick], { inner: { l: 10 * IN, w: 10 * IN, h: 6 * IN }, maxPayload: 1e9, minSupport: 0.6 });
    expect(res.leftover.map((l) => l.id)).toContain(brick.id);
  });
});

describe("box selection", () => {
  const boxes = defaultBoxes();

  it("puts a few small items in one small box", () => {
    const plan = planBoxes([item(4, 3, 3, 0.4), item(3, 3, 4, 0.35), item(5, 3, 2, 0.3)], boxes);
    expect(plan.packages).toHaveLength(1);
    expect(plan.packages[0].container.inner.l * plan.packages[0].container.inner.w * plan.packages[0].container.inner.h).toBeLessThan(13 * 11 * 9 * IN ** 3);
    plan.packages.forEach((p) => assertGeometry(p));
  });

  it("keeps live goods apart in insulated shippers", () => {
    const plan = planBoxes([item(4.5, 4.5, 4, 0.2, { handling: "live", keepUpright: true }), item(5, 4, 3, 0.5), item(5, 4, 3, 0.5)], boxes);
    const live = plan.packages.filter((p) => p.handling === "live");
    expect(live).toHaveLength(1);
    expect(live[0].container.insulated).toBe(true);
    expect(plan.packages.find((p) => p.handling === "standard")?.container.insulated).toBe(false);
  });

  it("ships enclosures in their own carton", () => {
    const plan = planBoxes([item(20, 20, 26, 25, { shipsInOwnBox: true, fragile: true }), item(4, 3, 3, 0.4)], boxes);
    expect(plan.packages.some((p) => p.kind === "own")).toBe(true);
  });

  it("splits by weight before exceeding a box's limit", () => {
    const heavy = many(12, () => item(6, 5, 4, 9)); // 108 lb
    const plan = planBoxes(heavy, boxes);
    for (const p of plan.packages) expect(p.grossWeight).toBeLessThanOrEqual(p.container.maxGross + 1);
    expect(plan.packages.reduce((s, p) => s + p.itemIds.length, 0)).toBe(12);
    plan.packages.forEach((p) => assertGeometry(p));
  });

  it("uses the long box for linear fixtures", () => {
    const plan = planBoxes([item(36, 4, 3, 2.6, { fragile: true })], boxes);
    expect(plan.packages[0].container.id).toBe("B-3808");
  });
});

describe("skids", () => {
  const boxes = defaultBoxes();
  const pallet = defaultPallet();

  it("palletizes a big restock heavy-first with no overlap", () => {
    const items = [...many(40, () => item(8, 6, 6, 5)), ...many(30, () => item(5, 4, 4, 1.2)), ...many(10, () => item(3, 3, 4, 0.4, { fragile: true }))];
    const plan = planSkid(items, boxes, pallet);
    const skids = plan.packages.filter((p) => p.kind === "pallet");
    expect(skids.length).toBeGreaterThanOrEqual(1);
    for (const s of skids) {
      assertGeometry(s);
      expect(s.outer.h).toBeLessThanOrEqual(DEFAULT_OPTIONS.palletMaxHeight + 10);
      // Heavy cartons ride low: the deck layer outweighs the upper layers on average
      // (fragile cartons are deliberately loaded last, so they are left out of the comparison).
      const child = (p: Placement) => s.children.find((c) => c.id === p.refId)!;
      const w = (p: Placement) => child(p).grossWeight;
      const sturdy = s.placements.filter((p) => !child(p).flags.includes("fragile"));
      const deck = sturdy.filter((p) => p.z < 1);
      const upper = sturdy.filter((p) => p.z >= 1);
      const mean = (list: Placement[]) => list.reduce((t, p) => t + w(p), 0) / Math.max(1, list.length);
      if (upper.length) expect(mean(deck)).toBeGreaterThanOrEqual(mean(upper));
      // Every carton above the deck sits on enough support.
      for (const p of upper) expect(p.supportRatio).toBeGreaterThanOrEqual(DEFAULT_OPTIONS.minSupportPallet);
    }
    const allItems = plan.packages.flatMap((p) => p.itemIds);
    expect(new Set(allItems).size).toBe(items.length);
  });

  it("recommends LTL for a large order and parcel for a small one", () => {
    const big = recommend(many(70, () => item(10, 8, 6, 8)), boxes, pallet);
    expect(big.recommended).toBe("skid");
    const small = recommend([item(4, 3, 3, 0.5), item(5, 4, 3, 1)], boxes, pallet);
    expect(small.recommended).toBe("boxes");
  });

  it("never puts live goods on a skid", () => {
    const plan = planSkid([...many(30, () => item(8, 6, 6, 5)), item(4.5, 4.5, 4, 0.2, { handling: "live", keepUpright: true })], boxes, pallet);
    const skidItems = new Set(plan.packages.filter((p) => p.kind === "pallet").flatMap((p) => p.itemIds));
    const live = Object.values(plan.items).find((i) => i.handling === "live")!;
    expect(skidItems.has(live.id)).toBe(false);
  });
});

describe("freight math", () => {
  it("computes billable weight from dims", () => {
    const d = { l: 24 * IN, w: 18 * IN, h: 18 * IN };
    expect(billableWeight(d, 2000)).toBeGreaterThan(2000);
  });
  it("classes a dense skid low and a light one high", () => {
    const d = { l: 48 * IN, w: 40 * IN, h: 48 * IN };
    expect(freightClass(d, 1500 * 453.592)).toBeLessThanOrEqual(65);
    expect(freightClass(d, 150 * 453.592)).toBeGreaterThanOrEqual(150);
  });
});
