import { prisma } from "@/lib/db";
import { quoteOrder } from "@/lib/service";

/** Quotes every carrier for the verified packages (demo tariffs). */
export async function POST(_req: Request, ctx: RouteContext<"/api/orders/[id]/rates">) {
  const { id } = await ctx.params;
  const shipment = await prisma.shipment.findUnique({ where: { orderId: id }, select: { checks: true } });
  if (!shipment) return Response.json({ error: "Build the order before rating it." }, { status: 409 });
  const pending = (JSON.parse(shipment.checks) as { status: string }[]).filter((c) => c.status === "pending").length;
  if (pending) return Response.json({ error: `${pending} package${pending > 1 ? "s are" : " is"} still waiting for approval.` }, { status: 409 });
  // A short pause so the UI can show carriers responding, like a live rate shop.
  await new Promise((r) => setTimeout(r, 900));
  return Response.json(await quoteOrder(prisma, id));
}
