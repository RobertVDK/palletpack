import type { createPrisma } from "./prisma-client";
import { parseOptions, productToItems, rowToContainer, SETTINGS_KEY } from "./domain";
import { generateOrder, mulberry32, type DraftOrder, type Rng } from "./orders/generate";
import { recommend, type Recommendation } from "./packing/plan";
import type { PackItem, PackPlan, PlanMode } from "./packing/types";
import { liveShipAdvice, quoteRates, type RateQuote } from "./rates";
import { bolNumber, proNumber, trackingNumber, type LabelDoc } from "./labels";
import { ulid } from "./ids";

// Order → plan → verify → rate → ship, shared by the API routes and the seed script.

type Db = ReturnType<typeof createPrisma>;

export interface PackageCheck {
  id: string;
  status: "pending" | "approved" | "adjusted";
  method: "calculated" | "measured" | "scale";
  dims: { l: number; w: number; h: number };
  weight: number;
  calcDims: { l: number; w: number; h: number };
  calcWeight: number;
  at?: string;
}

export interface Advice {
  recommended: PlanMode;
  reasons: string[];
  savingsCents: number;
  totals: Record<PlanMode, { shipCents: number; boxCents: number; packages: number; computeMs: number }>;
  excluded: { name: string; reason: string }[];
}

export async function loadContext(db: Db) {
  const [rows, setting] = await Promise.all([
    db.container.findMany({ where: { active: true }, orderBy: { sort: "asc" } }),
    db.setting.findUnique({ where: { key: SETTINGS_KEY } }),
  ]);
  const containers = rows.map(rowToContainer);
  const pallet = containers.find((c) => c.kind === "pallet");
  if (!pallet) throw new Error("No active skid configured");
  return { boxes: containers.filter((c) => c.kind === "box"), pallet, opts: parseOptions(setting?.value) };
}

export async function itemsForOrder(db: Db, orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { lines: { include: { product: true } } } });
  const items: PackItem[] = [];
  const excluded: Advice["excluded"] = [];
  for (const line of order.lines) {
    if (!line.product.requiresShipping) excluded.push({ name: line.product.title, reason: "Not a physical item" });
    else if (line.product.pickupOnly) excluded.push({ name: line.product.title, reason: "Pick-up only – held for collection" });
    else items.push(...productToItems(line.product, line.qty, line.id));
  }
  return { order, items, excluded };
}

export async function planOrder(db: Db, orderId: string, mode?: PlanMode) {
  const ctx = await loadContext(db);
  const { order, items, excluded } = await itemsForOrder(db, orderId);
  const rec: Recommendation = recommend(items, ctx.boxes, ctx.pallet, ctx.opts);
  const chosen = mode ?? rec.recommended;
  const plan = chosen === "skid" ? rec.skid : rec.boxes;
  const advice: Advice = {
    recommended: rec.recommended,
    reasons: rec.reasons,
    savingsCents: rec.savingsCents,
    totals: {
      boxes: { shipCents: rec.boxes.metrics.estShipCents, boxCents: rec.boxes.metrics.boxCostCents, packages: rec.boxes.packages.length, computeMs: rec.boxes.metrics.computeMs },
      skid: { shipCents: rec.skid.metrics.estShipCents, boxCents: rec.skid.metrics.boxCostCents, packages: rec.skid.packages.length, computeMs: rec.skid.metrics.computeMs },
    },
    excluded,
  };
  const checks: PackageCheck[] = plan.packages.map((p) => ({
    id: p.id,
    status: "pending",
    method: "calculated",
    dims: { ...p.outer },
    weight: p.grossWeight,
    calcDims: { ...p.outer },
    calcWeight: p.grossWeight,
  }));
  const data = { mode: chosen, plan: JSON.stringify(plan), advice: JSON.stringify(advice), checks: JSON.stringify(checks), quotes: "[]", rate: null, labels: "[]", totalCents: null, shippedAt: null };
  await db.shipment.upsert({ where: { orderId }, create: { id: ulid(), orderId, ...data }, update: data });
  await db.order.update({ where: { id: orderId }, data: { status: "planned" } });
  return { order, plan, advice, checks, alternate: chosen === "skid" ? rec.boxes : rec.skid };
}

export async function saveChecks(db: Db, orderId: string, checks: PackageCheck[]) {
  const all = checks.every((c) => c.status !== "pending");
  await db.shipment.update({ where: { orderId }, data: { checks: JSON.stringify(checks) } });
  await db.order.update({ where: { id: orderId }, data: { status: all ? "verified" : "planned" } });
  return { allApproved: all };
}

export async function quoteOrder(db: Db, orderId: string) {
  const shipment = await db.shipment.findUniqueOrThrow({ where: { orderId }, include: { order: { include: { lines: true } } } });
  const plan = JSON.parse(shipment.plan) as PackPlan;
  const checks = JSON.parse(shipment.checks) as PackageCheck[];
  const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
  const declared = shipment.order.lines.reduce((s, l) => s + l.priceCents * l.qty, 0);
  const quotes = quoteRates({
    pieces: plan.packages.map((p) => ({
      id: p.id,
      kind: p.kind === "pallet" ? "pallet" : "parcel",
      dims: byId[p.id]?.dims ?? p.outer,
      weight: byId[p.id]?.weight ?? p.grossWeight,
      handling: p.handling,
    })),
    destination: { city: shipment.order.city, province: shipment.order.province, residential: shipment.order.residential },
    declaredValueCents: declared,
  });
  await db.shipment.update({ where: { orderId }, data: { quotes: JSON.stringify(quotes) } });
  await db.order.update({ where: { id: orderId }, data: { status: "rated" } });
  const live = plan.packages.some((p) => p.handling === "live") ? liveShipAdvice(shipment.order.city, shipment.order.province) : null;
  return { quotes, live };
}

export async function bookOrder(db: Db, orderId: string, quoteId: string, rand: Rng = Math.random) {
  const shipment = await db.shipment.findUniqueOrThrow({ where: { orderId }, include: { order: true } });
  const quotes = JSON.parse(shipment.quotes) as RateQuote[];
  const quote = quotes.find((q) => q.id === quoteId);
  if (!quote) throw new Error("That rate has expired – get rates again.");
  const plan = JSON.parse(shipment.plan) as PackPlan;
  const parcels = plan.packages.filter((p) => p.kind !== "pallet");
  const pallets = plan.packages.filter((p) => p.kind === "pallet");
  const labels: LabelDoc[] = [];
  const bol = bolNumber(shipment.order.number);
  const pro = pallets.length ? proNumber(quote.carrierCode, rand) : undefined;
  pallets.forEach((p, i) =>
    labels.push({ packageId: p.id, kind: "pallet", tracking: pro!, carrier: quote.carrier, service: quote.service, index: i + 1, count: pallets.length, pro, bol }),
  );
  // Parcels ride the chosen courier; with an LTL booking, temperature-controlled boxes go Purolator Express.
  const parcelCarrier = quote.mode === "ltl" ? { code: "PUR", carrier: "Purolator", service: "Express" } : { code: quote.carrierCode, carrier: quote.carrier, service: quote.service };
  parcels.forEach((p, i) =>
    labels.push({
      packageId: p.id,
      kind: "parcel",
      tracking: trackingNumber(parcelCarrier.code, rand),
      carrier: parcelCarrier.carrier,
      service: parcelCarrier.service,
      index: i + 1,
      count: parcels.length,
    }),
  );

  // Draw the cartons and skids used from stock.
  const used = new Map<string, number>();
  for (const p of plan.packages) {
    if (p.kind === "box" || p.kind === "pallet") used.set(p.container.id, (used.get(p.container.id) ?? 0) + 1);
    for (const c of p.children) if (c.kind === "box") used.set(c.container.id, (used.get(c.container.id) ?? 0) + 1);
  }
  for (const [id, n] of used) await db.container.updateMany({ where: { id }, data: { stock: { decrement: n } } });

  await db.shipment.update({
    where: { orderId },
    data: { rate: JSON.stringify(quote), labels: JSON.stringify(labels), totalCents: quote.totalCents, shippedAt: new Date() },
  });
  await db.order.update({ where: { id: orderId }, data: { status: "shipped" } });
  return { labels, quote, used: Object.fromEntries(used) };
}

export async function nextOrderNumber(db: Db) {
  const last = await db.order.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
  const n = last ? Number(last.number.replace(/\D/g, "")) + 1 : 10_481;
  return `NG-${n}`;
}

export async function createOrder(db: Db, draft: DraftOrder, placedAt = new Date()) {
  const number = await nextOrderNumber(db);
  const id = ulid();
  return db.order.create({
    data: {
      id,
      number,
      channel: draft.channel,
      status: "new",
      customer: draft.customer,
      company: draft.company,
      email: draft.email,
      phone: draft.phone,
      address1: draft.address1,
      city: draft.city,
      province: draft.province,
      postal: draft.postal,
      residential: draft.residential,
      scenario: draft.scenario,
      note: draft.note,
      placedAt,
      lines: { create: draft.lines.map((l) => ({ id: ulid(), productId: l.productId, qty: l.qty, priceCents: l.priceCents })) },
    },
  });
}

export async function productPool(db: Db) {
  return db.product.findMany({
    where: { requiresShipping: true, pickupOnly: false },
    select: { id: true, category: true, title: true, priceCents: true, dimsSource: true },
  });
}

export async function simulateOrder(db: Db, scenario?: string, seed?: number) {
  const pool = await productPool(db);
  const rng = seed !== undefined ? mulberry32(seed) : mulberry32(Math.floor(Math.random() * 2 ** 31));
  return createOrder(db, generateOrder(pool, rng, scenario));
}
