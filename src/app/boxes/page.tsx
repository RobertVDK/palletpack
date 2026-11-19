import { prisma } from "@/lib/db";
import { parseOptions, SETTINGS_KEY } from "@/lib/domain";
import { BoxEditor } from "@/components/boxes/BoxEditor";

export const dynamic = "force-dynamic";

export default async function BoxesPage() {
  const [containers, setting, used] = await Promise.all([
    prisma.container.findMany({ orderBy: { sort: "asc" } }),
    prisma.setting.findUnique({ where: { key: SETTINGS_KEY } }),
    prisma.shipment.findMany({ where: { shippedAt: { not: null } }, select: { plan: true } }),
  ]);
  // How often each box has been used on shipped orders (from stored plans).
  const usage: Record<string, number> = {};
  for (const s of used) {
    const plan = JSON.parse(s.plan) as { packages: { container: { id: string }; children: { container: { id: string } }[] }[] };
    for (const p of plan.packages) {
      usage[p.container.id] = (usage[p.container.id] ?? 0) + 1;
      for (const c of p.children) usage[c.container.id] = (usage[c.container.id] ?? 0) + 1;
    }
  }
  return <BoxEditor initial={containers} options={parseOptions(setting?.value)} usage={usage} />;
}
