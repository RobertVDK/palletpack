import { z } from "zod";
import { prisma } from "@/lib/db";
import { SETTINGS_KEY } from "@/lib/domain";

const Row = z.object({
  id: z.string().min(2),
  name: z.string().min(1),
  kind: z.enum(["box", "pallet"]),
  innerL: z.number().int().positive(),
  innerW: z.number().int().positive(),
  innerH: z.number().int().nonnegative(),
  outerL: z.number().int().positive(),
  outerW: z.number().int().positive(),
  outerH: z.number().int().positive(),
  tare: z.number().int().nonnegative(),
  maxGross: z.number().int().positive(),
  costCents: z.number().int().nonnegative(),
  insulated: z.boolean(),
  accepts: z.string(),
  stock: z.number().int().nonnegative(),
  coolant: z.number().int().nullable(),
  deckHeight: z.number().int().nullable(),
  active: z.boolean(),
  sort: z.number().int(),
});

const Options = z.object({
  fragilePad: z.number().min(0).max(80),
  minSupportBox: z.number().min(0.3).max(1),
  minSupportPallet: z.number().min(0.5).max(1),
  palletMaxHeight: z.number().min(600).max(2600),
  parcelMaxGross: z.number().positive(),
});

/** Saves the whole box catalogue and the packing rules in one go. */
export async function PUT(request: Request) {
  const parsed = z.object({ containers: z.array(Row), options: Options }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: parsed.error.issues }, { status: 422 });
  const { containers, options } = parsed.data;
  if (!containers.some((c) => c.kind === "pallet" && c.active)) return Response.json({ error: "Keep at least one active skid." }, { status: 422 });
  await prisma.$transaction([
    ...containers.map((c) => prisma.container.upsert({ where: { id: c.id }, create: c, update: c })),
    prisma.container.deleteMany({ where: { id: { notIn: containers.map((c) => c.id) } } }),
    prisma.setting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value: JSON.stringify(options) }, update: { value: JSON.stringify(options) } }),
  ]);
  return Response.json({ ok: true });
}
