import { z } from "zod";
import { prisma } from "@/lib/db";
import { saveChecks } from "@/lib/service";

const D = z.object({ l: z.number().positive(), w: z.number().positive(), h: z.number().positive() });
const Check = z.object({
  id: z.string(),
  status: z.enum(["pending", "approved", "adjusted"]),
  method: z.enum(["calculated", "measured", "scale"]),
  dims: D,
  weight: z.number().positive(),
  calcDims: D,
  calcWeight: z.number().positive(),
  at: z.string().optional(),
});

/** Saves what the packer confirmed on the floor: approved as calculated, re-measured, or weighed. */
export async function PUT(request: Request, ctx: RouteContext<"/api/orders/[id]/checks">) {
  const { id } = await ctx.params;
  const parsed = z.object({ checks: z.array(Check) }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  return Response.json(await saveChecks(prisma, id, parsed.data.checks));
}
