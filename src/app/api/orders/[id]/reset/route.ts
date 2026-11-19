import { prisma } from "@/lib/db";

/** Demo helper: puts an order back in the queue so the flow can be shown again. */
export async function POST(_req: Request, ctx: RouteContext<"/api/orders/[id]/reset">) {
  const { id } = await ctx.params;
  await prisma.shipment.deleteMany({ where: { orderId: id } });
  await prisma.order.update({ where: { id }, data: { status: "new" } });
  return Response.json({ ok: true });
}
