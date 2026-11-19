"use client";

import { AlertTriangle, ArrowRight, Box, CircleDot, Layers3, Printer, ShieldCheck, Sparkles } from "lucide-react";
import type { QueueOrder } from "@/components/app-store";
import { useApp } from "@/components/app-store";
import { cn } from "@/lib/cn";
import type { OrderDetail } from "@/lib/queries";
import type { Package, PlanMode } from "@/lib/packing/types";
import { dims as fmtDims, money, weight as fmtWeight } from "@/lib/units";
import { Button, FlagIcons, Pill, Stat } from "@/components/ui";
import { PackSheet } from "./PackSheet";
import { RatesPanel } from "./RatesPanel";
import { ShipPanel } from "./ShipPanel";
import { useStation } from "./store";
import { VerifyPanel } from "./VerifyPanel";

function PackageCard({ p, depth = 0 }: { p: Package; depth?: number }) {
  const { selected, set } = useStation();
  const units = useApp((s) => s.units);
  const active = selected === p.id;
  return (
    <div>
      <button
        onClick={() => set({ selected: p.id, build: p.placements.length, playing: false, exploded: false })}
        className={cn(
          "w-full rounded-lg border px-3 py-2 text-left transition",
          active ? "border-signal/70 bg-signal/[0.06]" : "border-steel-700 bg-steel-850 hover:border-steel-600",
          depth > 0 && "py-1.5",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {p.kind === "pallet" ? <Layers3 className="size-4 shrink-0 text-pine" /> : <Box className={cn("size-4 shrink-0", p.handling === "live" ? "text-live" : p.handling === "frozen" ? "text-frozen" : "text-kraft")} />}
            <span className="text-xs font-bold text-steel-50">{p.id}</span>
            <span className="truncate text-xs text-steel-300">{p.container.name}</span>
          </div>
          <FlagIcons flags={p.flags} />
        </div>
        <div className="mt-1 flex items-end justify-between gap-2">
          <span className="wide text-[13px] font-bold text-steel-100">{fmtDims(p.outer, units)}</span>
          <span className="text-xs text-steel-300">{fmtWeight(p.grossWeight, units)}</span>
        </div>
        {p.kind !== "own" && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded bg-steel-700">
              <div className={cn("h-full rounded", p.fill > 0.75 ? "bg-ok" : p.fill > 0.5 ? "bg-signal" : "bg-warn")} style={{ width: `${Math.round(p.fill * 100)}%` }} />
            </div>
            <span className="w-16 text-right text-[11px] text-steel-400">{Math.round(p.fill * 100)}% {p.kind === "pallet" ? "cube" : "full"}</span>
          </div>
        )}
      </button>
      {p.children.length > 0 && (
        <div className="mt-1 ml-3 space-y-1 border-l border-steel-700 pl-2">
          {p.children.map((c) => (
            <PackageCard key={c.id} p={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanPanel({ onReplan, onConfirm }: { onReplan: (m: PlanMode) => void; onConfirm: () => void }) {
  const { detail, loading } = useStation();
  const units = useApp((s) => s.units);
  const s = detail?.shipment;
  if (!detail || !s) return <div className="p-4 text-sm text-steel-400">{loading ? "Planning…" : "Pick an order to build it."}</div>;
  const { plan, advice } = s;
  const totals = advice.totals;
  const cost = (m: PlanMode) => totals[m].shipCents + totals[m].boxCents;
  const recommendedHere = advice.recommended === s.mode;
  const m = plan.metrics;

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <section className="rounded-xl border border-steel-700 bg-steel-850 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-steel-300">Ship as</h3>
            <span className="text-[11px] text-steel-500">
              {m.computeMs} ms · {m.candidatesTried.toLocaleString()} placements tried
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["boxes", "skid"] as PlanMode[]).map((mode) => {
              const on = s.mode === mode;
              return (
                <button
                  key={mode}
                  disabled={loading || on}
                  onClick={() => onReplan(mode)}
                  className={cn(
                    "relative rounded-lg border p-2.5 text-left transition",
                    on ? "border-signal bg-signal/10" : "border-steel-700 hover:border-steel-500",
                  )}
                >
                  {advice.recommended === mode && (
                    <span className="absolute -top-2 right-2 flex items-center gap-1 rounded bg-signal px-1.5 text-[10px] font-bold text-signal-ink">
                      <Sparkles className="size-3" /> Best
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-steel-100">
                    {mode === "skid" ? <Layers3 className="size-3.5" /> : <Box className="size-3.5" />}
                    {mode === "skid" ? "Skid · LTL" : "Boxes · parcel"}
                  </div>
                  <div className="wide mt-1 text-lg font-bold text-steel-50">{money(cost(mode))}</div>
                  <div className="text-[11px] text-steel-400">
                    {totals[mode].packages} package{totals[mode].packages === 1 ? "" : "s"} · est.
                  </div>
                </button>
              );
            })}
          </div>
          <ul className="mt-3 space-y-1.5">
            {advice.reasons.map((r, i) => (
              <li key={i} className="flex gap-2 text-xs leading-snug text-steel-200">
                <CircleDot className="mt-0.5 size-3 shrink-0 text-signal" />
                {r}
              </li>
            ))}
          </ul>
          {!recommendedHere && (
            <button onClick={() => onReplan(advice.recommended)} className="mt-2 text-xs font-semibold text-signal hover:underline">
              Switch back to the recommended {advice.recommended === "skid" ? "skid" : "boxes"} build
            </button>
          )}
        </section>

        <section className="grid grid-cols-3 gap-3 px-1">
          <Stat label="Packages" value={plan.packages.length} sub={`${m.units} units`} />
          <Stat label="Gross" value={fmtWeight(m.grossWeight, units)} sub="incl. cartons" />
          <Stat label="Avg fill" value={`${Math.round(m.avgFill * 100)}%`} sub={`boxes ${money(m.boxCostCents)}`} />
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold text-steel-300">Packages</h3>
          <div className="space-y-1.5">
            {plan.packages.map((p) => (
              <PackageCard key={p.id} p={p} />
            ))}
          </div>
        </section>

        {(plan.notes.length > 0 || advice.excluded.length > 0) && (
          <section>
            <h3 className="mb-2 text-xs font-semibold text-steel-300">Rules applied</h3>
            <ul className="space-y-1.5">
              {plan.notes.map((n, i) => (
                <li key={i} className="flex gap-2 text-xs leading-snug text-steel-200">
                  {n.level === "warn" ? (
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" />
                  ) : n.level === "rule" ? (
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ok" />
                  ) : (
                    <CircleDot className="mt-0.5 size-3.5 shrink-0 text-steel-400" />
                  )}
                  {n.text}
                </li>
              ))}
              {advice.excluded.map((e, i) => (
                <li key={`x${i}`} className="flex gap-2 text-xs leading-snug text-steel-200">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" />
                  <span>
                    <b>{e.name}</b> – {e.reason}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className="space-y-2 border-t border-steel-700 bg-steel-900 p-4">
        <Button size="xl" className="w-full" onClick={onConfirm} disabled={loading}>
          Confirm build and verify <ArrowRight className="size-5" />
        </Button>
        <Button variant="ghost" size="sm" className="w-full" onClick={() => window.print()}>
          <Printer className="size-3.5" /> Print pack sheet
        </Button>
      </div>
    </>
  );
}

export function SidePanel({ onReplan, onReload, onOpen, orders }: { onReplan: (m: PlanMode) => void; onReload: (d?: OrderDetail) => Promise<void>; onOpen: (id: string) => void; orders: QueueOrder[] }) {
  const { step, set, detail } = useStation();
  return (
    <aside className="flex min-h-0 flex-col border-t border-steel-700 bg-steel-900 lg:border-t-0 lg:border-l">
      <div className="flex items-center justify-between border-b border-steel-700 px-4 py-3">
        <h2 className="wide text-sm font-bold text-steel-50">
          {step === "pack" ? "Build plan" : step === "verify" ? "Verify packages" : step === "rate" ? "Shipping rates" : "Shipped"}
        </h2>
        {detail?.shipment && step !== "ship" && <Pill tone={detail.shipment.mode === "skid" ? "kraft" : "neutral"}>{detail.shipment.mode === "skid" ? "Skid build" : "Box build"}</Pill>}
      </div>
      {step === "pack" && <PlanPanel onReplan={onReplan} onConfirm={() => set({ step: "verify" })} />}
      {step === "verify" && <VerifyPanel onDone={() => onReload().then(() => set({ step: "rate" }))} />}
      {step === "rate" && <RatesPanel onBooked={(d) => onReload(d).then(() => set({ step: "ship" }))} />}
      {step === "ship" && <ShipPanel orders={orders} onOpen={onOpen} onReload={onReload} />}
      {detail?.shipment && <PackSheet />}
    </aside>
  );
}
