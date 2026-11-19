import { z } from "zod";
import { prisma } from "@/lib/db";
import { orderDetail } from "@/lib/queries";
import { planOrder } from "@/lib/service";

const Body = z.object({ mode: z.enum(["boxes", "skid"]).optional() });

/** Runs the packer for the order (recommended mode unless one is forced) and stores the plan. */
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/plan">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "mode must be boxes or skid" }, { status: 400 });
  const { alternate } = await planOrder(prisma, id, parsed.data.mode);
  return Response.json({ detail: await orderDetail(id), alternate });
}
