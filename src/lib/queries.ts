import "server-only";
import { prisma } from "./db";
import { cdnImage } from "./domain";
import type { PackPlan } from "./packing/types";
import type { RateQuote } from "./rates";
import type { LabelDoc } from "./labels";
import type { Advice, PackageCheck } from "./service";

const orderInclude = { lines: { include: { product: true } }, shipment: true } as const;

type OrderWithLines = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

async function loadOrder(id: string) {
  return prisma.order.findUnique({ where: { id }, include: orderInclude });
}

export function toQueue(o: OrderWithLines) {
  const flags = new Set<string>();
  for (const l of o.lines) {
    if (l.product.handling === "live") flags.add("live");
    if (l.product.handling === "frozen") flags.add("frozen");
    if (l.product.fragile) flags.add("fragile");
    if (l.product.shipsInOwnBox) flags.add("bulky");
    if (l.product.pickupOnly) flags.add("pickup");
  }
  if (o.shipment?.mode === "skid") flags.add("skid");
  return {
    id: o.id,
    number: o.number,
    status: o.status,
    customer: o.customer,
    company: o.company,
    city: o.city,
    province: o.province,
    channel: o.channel,
    scenario: o.scenario,
    placedAt: o.placedAt.toISOString(),
    units: o.lines.reduce((s, l) => s + l.qty, 0),
    lines: o.lines.length,
    thumbs: o.lines.slice(0, 4).map((l) => cdnImage(l.product.image, 96)),
    flags: [...flags],
  };
}

export async function queueOrders() {
  const orders = await prisma.order.findMany({ include: orderInclude, orderBy: { placedAt: "desc" }, take: 60 });
  return orders.map(toQueue);
}

export async function queueOrder(id: string) {
  const o = await loadOrder(id);
  return o ? toQueue(o) : null;
}

export type OrderDetail = NonNullable<Awaited<ReturnType<typeof orderDetail>>>;

export async function orderDetail(id: string) {
  const o = await loadOrder(id);
  if (!o) return null;
  const s = o.shipment;
  return {
    order: {
      id: o.id,
      number: o.number,
      status: o.status,
      customer: o.customer,
      company: o.company,
      email: o.email,
      phone: o.phone,
      address1: o.address1,
      city: o.city,
      province: o.province,
      postal: o.postal,
      residential: o.residential,
      channel: o.channel,
      scenario: o.scenario,
      note: o.note,
      placedAt: o.placedAt.toISOString(),
    },
    lines: o.lines.map((l) => ({
      id: l.id,
      qty: l.qty,
      priceCents: l.priceCents,
      product: {
        id: l.product.id,
        title: l.product.title,
        image: cdnImage(l.product.image, 160),
        url: l.product.url,
        category: l.product.category,
        sku: l.product.sku,
        dims: { l: l.product.length, w: l.product.width, h: l.product.height },
        dimsSource: l.product.dimsSource,
        dimsNote: l.product.dimsNote,
        weight: l.product.weight,
        weightSource: l.product.weightSource,
        weightNote: l.product.weightNote,
        handling: l.product.handling,
        fragile: l.product.fragile,
        keepUpright: l.product.keepUpright,
        shipsInOwnBox: l.product.shipsInOwnBox,
        pickupOnly: l.product.pickupOnly,
        verified: !!l.product.verifiedAt,
      },
    })),
    shipment: s
      ? {
          mode: s.mode as PackPlan["mode"],
          plan: JSON.parse(s.plan) as PackPlan,
          advice: JSON.parse(s.advice) as Advice,
          checks: JSON.parse(s.checks) as PackageCheck[],
          quotes: JSON.parse(s.quotes) as RateQuote[],
          rate: s.rate ? (JSON.parse(s.rate) as RateQuote) : null,
          labels: JSON.parse(s.labels) as LabelDoc[],
          totalCents: s.totalCents,
          shippedAt: s.shippedAt?.toISOString() ?? null,
        }
      : null,
  };
}
