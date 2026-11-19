import { prisma } from "@/lib/db";
import type { LabelDoc } from "@/lib/labels";
import type { PackPlan } from "@/lib/packing/types";
import type { RateQuote } from "@/lib/rates";
import type { Advice, PackageCheck } from "@/lib/service";
import { ShipmentsTable, type ShipmentRow } from "@/components/shipments/ShipmentsTable";

export const dynamic = "force-dynamic";

export default async function ShipmentsPage() {
  const rows = await prisma.shipment.findMany({ where: { shippedAt: { not: null } }, include: { order: true }, orderBy: { shippedAt: "desc" } });
  const list: ShipmentRow[] = rows.map((s) => {
    const plan = JSON.parse(s.plan) as PackPlan;
    const advice = JSON.parse(s.advice) as Advice;
    return {
      id: s.id,
      shippedAt: s.shippedAt!.toISOString(),
      mode: s.mode as "boxes" | "skid",
      order: {
        number: s.order.number,
        customer: s.order.customer,
        company: s.order.company,
        address1: s.order.address1,
        city: s.order.city,
        province: s.order.province,
        postal: s.order.postal,
        phone: s.order.phone,
        residential: s.order.residential,
      },
      plan,
      rate: JSON.parse(s.rate ?? "null") as RateQuote,
      labels: JSON.parse(s.labels) as LabelDoc[],
      checks: JSON.parse(s.checks) as PackageCheck[],
      followedAdvice: advice.recommended === s.mode,
      savingsCents: advice.recommended === s.mode ? advice.savingsCents : 0,
      adjusted: (JSON.parse(s.checks) as PackageCheck[]).filter((c) => c.status === "adjusted").length,
    };
  });
  return <ShipmentsTable rows={list} />;
}
