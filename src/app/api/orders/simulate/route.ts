import { prisma } from "@/lib/db";
import { queueOrder } from "@/lib/queries";
import { simulateOrder } from "@/lib/service";

/** Creates a realistic demo order, as if it had just come in from the storefront. */
export async function POST(request: Request) {
  const { scenario } = (await request.json().catch(() => ({}))) as { scenario?: string };
  const order = await simulateOrder(prisma, scenario);
  return Response.json(await queueOrder(order.id), { status: 201 });
}
