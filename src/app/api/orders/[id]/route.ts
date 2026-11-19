import { orderDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/orders/[id]">) {
  const { id } = await ctx.params;
  const detail = await orderDetail(id);
  if (!detail) return Response.json({ error: "Order not found" }, { status: 404 });
  return Response.json(detail);
}
