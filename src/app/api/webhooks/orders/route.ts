import { z } from "zod";
import { prisma } from "@/lib/db";
import { queueOrder } from "@/lib/queries";
import { createOrder, planOrder } from "@/lib/service";

// Order intake for storefronts and ERPs. Accepts a trimmed Shopify-style order:
// lines reference products by SKU or handle. The order is planned straight away.

const Body = z.object({
  customer: z.string().min(1),
  company: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  address1: z.string().min(1),
  city: z.string().min(1),
  province: z.string().length(2),
  postal: z.string().min(3),
  residential: z.boolean().default(true),
  note: z.string().optional(),
  lines: z.array(z.object({ sku: z.string().optional(), handle: z.string().optional(), qty: z.number().int().positive() })).min(1),
});

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 422 });
  const b = parsed.data;
  const missing: string[] = [];
  const lines: { productId: string; qty: number; priceCents: number }[] = [];
  for (const l of b.lines) {
    const p = await prisma.product.findFirst({ where: l.handle ? { handle: l.handle } : { sku: l.sku } });
    if (!p) missing.push(l.handle ?? l.sku ?? "?");
    else lines.push({ productId: p.id, qty: l.qty, priceCents: p.priceCents ?? 0 });
  }
  if (missing.length) return Response.json({ error: `Unknown products: ${missing.join(", ")}` }, { status: 422 });
  const order = await createOrder(prisma, {
    scenario: "API order",
    channel: "api",
    customer: b.customer,
    company: b.company ?? null,
    email: b.email,
    phone: b.phone ?? "",
    address1: b.address1,
    city: b.city,
    province: b.province.toUpperCase(),
    postal: b.postal.toUpperCase(),
    residential: b.residential,
    note: b.note ?? null,
    lines,
  });
  const { plan, advice } = await planOrder(prisma, order.id);
  return Response.json(
    {
      order: await queueOrder(order.id),
      recommended: advice.recommended,
      packages: plan.packages.map((p) => ({ id: p.id, kind: p.kind, container: p.container.name, outer: p.outer, grossWeight: p.grossWeight })),
    },
    { status: 201 },
  );
}
