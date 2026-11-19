import { z } from "zod";
import { prisma } from "@/lib/db";

const Body = z.object({
  length: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  weight: z.number().int().positive(),
  fragile: z.boolean().optional(),
  keepUpright: z.boolean().optional(),
});

/** Records measured dimensions for a product; they then count as confirmed rather than estimated. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/products/[id]">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 422 });
  const p = await prisma.product.update({
    where: { id },
    data: {
      ...parsed.data,
      dimsSource: "measured",
      dimsNote: "Measured on the warehouse floor",
      weightSource: "measured",
      weightNote: "Weighed on the warehouse floor",
      verifiedAt: new Date(),
    },
  });
  return Response.json(p);
}
