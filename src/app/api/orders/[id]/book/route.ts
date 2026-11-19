import { z } from "zod";
import { prisma } from "@/lib/db";
import { orderDetail } from "@/lib/queries";
import { bookOrder } from "@/lib/service";

/** Books the chosen rate: creates labels (or a BOL for skids) and draws cartons from stock. */
export async function POST(request: Request, ctx: RouteContext<"/api/orders/[id]/book">) {
  const { id } = await ctx.params;
  const parsed = z.object({ quoteId: z.string() }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "quoteId is required" }, { status: 400 });
  try {
    const res = await bookOrder(prisma, id, parsed.data.quoteId);
    return Response.json({ ...res, detail: await orderDetail(id) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
}
