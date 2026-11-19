"use client";

import { useApp } from "@/components/app-store";
import { stepText } from "@/lib/packing/instructions";
import { dims as fmtDims, weight as fmtWeight } from "@/lib/units";
import { useStation } from "./store";

/** Printed pick-and-pack sheet: every package with its placements in order. Shown only when printing from the build step. */
export function PackSheet() {
  const { detail, step } = useStation();
  const units = useApp((s) => s.units);
  const s = detail?.shipment;
  if (!detail || !s || step !== "pack") return null;
  const all = s.plan.packages.flatMap((p) => (p.kind === "pallet" ? [...p.children, p] : [p]));
  return (
    <div className="print-only p-6 font-sans text-[12px] text-black">
      <h1 className="wide text-2xl font-black">
        Pack sheet {detail.order.number} · {detail.order.company ?? detail.order.customer}
      </h1>
      <p className="mb-4">
        {detail.order.city}, {detail.order.province} · {s.mode === "skid" ? "skid build" : "box build"} · {s.plan.metrics.units} units
      </p>
      {all.map((p) => (
        <section key={p.id} className="mb-4 break-inside-avoid border-t-2 border-black pt-2">
          <h2 className="text-base font-bold">
            {p.id} · {p.container.name} · {fmtDims(p.outer, units)} · {fmtWeight(p.grossWeight, units)}
          </h2>
          <ol className="mt-1 list-decimal pl-5">
            {p.placements.map((_, i) => {
              const t = stepText(s.plan, p, i);
              return (
                <li key={i}>
                  <b>{t.title}</b> – {t.detail}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
