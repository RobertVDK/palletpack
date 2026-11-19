"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Minus, Plus, RotateCcw, Ruler, Scale, Truck } from "lucide-react";
import { useApp } from "@/components/app-store";
import { cn } from "@/lib/cn";
import type { PackageCheck } from "@/lib/service";
import { len, lenUnit, toGrams, toMm, weight as fmtWeight, weightUnit, weightValue, type Units } from "@/lib/units";
import { Button, FlagIcons, Pill } from "@/components/ui";
import { useStation } from "./store";

function Stepper({ label, value, unit, step, onChange }: { label: string; value: number; unit: string; step: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] text-steel-400">{label}</span>
      <div className="mt-1 flex h-14 items-stretch overflow-hidden rounded-lg border border-steel-600 bg-steel-950">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(Math.max(step, +(value - step).toFixed(2)))} className="grid w-12 place-items-center text-steel-300 hover:bg-steel-800">
          <Minus className="size-5" />
        </button>
        <input
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(Number(e.target.value))}
          className="wide w-full min-w-0 bg-transparent text-center text-xl font-bold text-steel-50 outline-none"
        />
        <span className="grid place-items-center pr-2 text-xs text-steel-400">{unit}</span>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(+(value + step).toFixed(2))} className="grid w-12 place-items-center text-steel-300 hover:bg-steel-800">
          <Plus className="size-5" />
        </button>
      </div>
    </label>
  );
}

function ScaleReading({ target, units, onDone }: { target: number; units: Units; onDone: (g: number) => void }) {
  // A floor scale settling: overshoot, wobble, then lock. The reading lands within ±3% of the plan.
  const [shown, setShown] = useState(0);
  const [final, setFinal] = useState<number | null>(null);
  useEffect(() => {
    const reading = target * (0.975 + Math.random() * 0.05);
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 1600);
      const wobble = Math.sin(k * 18) * (1 - k) * 0.12;
      setShown(reading * (1 - Math.pow(1 - k, 3)) * (1 + wobble));
      if (k < 1) raf = requestAnimationFrame(tick);
      else {
        setShown(reading);
        setFinal(reading);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  const locked = final !== null;
  const delta = locked ? (final - target) / target : 0;
  return (
    <div className="rounded-xl border border-steel-600 bg-black p-4 text-center">
      <div className="text-[11px] text-steel-400">{locked ? "Stable" : "Reading scale…"}</div>
      <div className={cn("wide my-1 text-4xl font-black tracking-tight tabular-nums", locked ? "text-ok" : "text-signal")}>
        {weightValue(shown, units).toFixed(units === "metric" ? 2 : 1)} <span className="text-lg">{weightUnit(units)}</span>
      </div>
      {locked && (
        <>
          <div className={cn("text-xs", Math.abs(delta) > 0.05 ? "text-warn" : "text-steel-300")}>
            Plan {fmtWeight(target, units)} · {delta >= 0 ? "+" : ""}
            {(delta * 100).toFixed(1)}%{Math.abs(delta) > 0.05 && " – check the contents"}
          </div>
          <Button size="lg" variant="ok" className="mt-3 w-full" onClick={() => onDone(Math.round(final))}>
            <Check className="size-5" /> Use this weight
          </Button>
        </>
      )}
    </div>
  );
}

export function VerifyPanel({ onDone }: { onDone: () => Promise<void> }) {
  const { detail, selected, set } = useStation();
  const units = useApp((s) => s.units);
  const shipment = detail?.shipment;
  const [checks, setChecks] = useState<PackageCheck[]>(shipment?.checks ?? []);
  // The open form (measure / scale) belongs to one package; switching packages closes it.
  const [modeFor, setModeFor] = useState<{ id: string; mode: "idle" | "measure" | "scale" }>({ id: "", mode: "idle" });
  const [form, setForm] = useState({ l: 0, w: 0, h: 0, wt: 0 });
  const [saving, setSaving] = useState(false);

  const packages = shipment?.plan.packages ?? [];
  const current = checks.find((c) => c.id === selected) ?? checks.find((c) => c.status === "pending") ?? checks[0];
  const pkg = packages.find((p) => p.id === current?.id);
  const approved = checks.filter((c) => c.status !== "pending").length;
  const mode = modeFor.id === current?.id ? modeFor.mode : "idle";
  const setMode = (m: "idle" | "measure" | "scale") => setModeFor({ id: current?.id ?? "", mode: m });

  // Show the package being verified closed, at full build, with its dimensions called out.
  useEffect(() => {
    if (!current) return;
    const p = packages.find((x) => x.id === current.id);
    set({ selected: current.id, build: p?.placements.length ?? 0, playing: false, showDims: true, exploded: false, xray: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  if (!shipment || !current || !pkg) return <div className="p-4 text-sm text-steel-400">Build the order first.</div>;

  async function persist(next: PackageCheck[]) {
    setChecks(next);
    if (detail?.shipment) set({ detail: { ...detail, shipment: { ...detail.shipment, checks: next } } });
    const res = await fetch(`/api/orders/${detail!.order.id}/checks`, { method: "PUT", body: JSON.stringify({ checks: next }) });
    if (!res.ok) toast.error("Could not save the check");
  }

  function advance(next: PackageCheck[]) {
    const pending = next.find((c) => c.status === "pending");
    if (pending) set({ selected: pending.id });
  }

  async function record(patch: Partial<PackageCheck>) {
    const next = checks.map((c) => (c.id === current!.id ? { ...c, ...patch, at: new Date().toISOString() } : c));
    await persist(next);
    advance(next);
  }

  const approve = () => record({ status: "approved", method: "calculated", dims: current.calcDims, weight: current.calcWeight });
  const startMeasure = () => {
    setForm({
      l: +len(current.dims.l, units, 1),
      w: +len(current.dims.w, units, 1),
      h: +len(current.dims.h, units, 1),
      wt: +weightValue(current.weight, units).toFixed(1),
    });
    setMode("measure");
  };
  const saveMeasure = () => {
    const dims = { l: Math.round(toMm(form.l, units)), w: Math.round(toMm(form.w, units)), h: Math.round(toMm(form.h, units)) };
    const weight = Math.round(toGrams(form.wt, units));
    const same = Math.abs(dims.l - current.calcDims.l) < 3 && Math.abs(dims.w - current.calcDims.w) < 3 && Math.abs(dims.h - current.calcDims.h) < 3 && Math.abs(weight - current.calcWeight) < 50;
    record({ status: same ? "approved" : "adjusted", method: "measured", dims, weight });
    setMode("idle");
  };

  const isPallet = pkg.kind === "pallet";
  const statusTone = current.status === "approved" ? "ok" : current.status === "adjusted" ? "signal" : "neutral";

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <div className="flex items-center justify-between text-xs text-steel-300">
            <span>
              {approved} of {checks.length} confirmed
            </span>
            <button
              className="font-semibold text-steel-400 hover:text-signal"
              onClick={async () => {
                const next = checks.map((c) => (c.status === "pending" ? { ...c, status: "approved" as const, method: "calculated" as const, at: new Date().toISOString() } : c));
                await persist(next);
              }}
            >
              Approve all as calculated
            </button>
          </div>
          <div className="mt-1.5 flex gap-1">
            {checks.map((c) => (
              <button
                key={c.id}
                onClick={() => set({ selected: c.id })}
                title={c.id}
                className={cn(
                  "h-2 flex-1 rounded-full transition",
                  c.status === "approved" ? "bg-ok" : c.status === "adjusted" ? "bg-signal" : "bg-steel-700",
                  c.id === current.id && "ring-2 ring-steel-200 ring-offset-2 ring-offset-steel-900",
                )}
              />
            ))}
          </div>
        </div>

        <section className="rounded-2xl border border-steel-600 bg-steel-850 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="wide text-base font-black text-steel-50">{pkg.id}</span>
              <FlagIcons flags={pkg.flags} />
            </div>
            <Pill tone={statusTone}>{current.status === "pending" ? "Waiting" : current.status === "approved" ? `Approved · ${current.method}` : `Adjusted · ${current.method}`}</Pill>
          </div>
          <div className="mt-0.5 text-xs text-steel-400">
            {pkg.container.name}
            {isPallet && ` · ${pkg.children.length} cartons, wrapped`}
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="text-[11px] text-steel-400">{current.status === "pending" ? "Planned size" : "Confirmed size"}</div>
              <div className="wide flex items-baseline gap-1 text-[30px] leading-none font-black text-steel-50">
                {len(current.dims.l, units, 1)}
                <span className="text-xl text-steel-500">×</span>
                {len(current.dims.w, units, 1)}
                <span className="text-xl text-steel-500">×</span>
                {len(current.dims.h, units, 1)}
                <span className="ml-1 text-sm font-semibold text-steel-400">{lenUnit(units)}</span>
              </div>
            </div>
            <div>
              <div className="text-[11px] text-steel-400">Weight</div>
              <div className="wide flex items-baseline gap-1 text-[30px] leading-none font-black text-signal">
                {weightValue(current.weight, units).toFixed(1)}
                <span className="ml-1 text-sm font-semibold text-steel-400">{weightUnit(units)}</span>
              </div>
            </div>
          </div>
          {current.status === "adjusted" && (
            <div className="mt-2 text-xs text-steel-400">
              Plan was {len(current.calcDims.l, units, 1)} × {len(current.calcDims.w, units, 1)} × {len(current.calcDims.h, units, 1)} {lenUnit(units)}, {fmtWeight(current.calcWeight, units)}
            </div>
          )}

          {mode === "idle" && (
            <div className="mt-5 space-y-2">
              <Button size="xl" className="w-full" onClick={approve}>
                <Check className="size-6" strokeWidth={3} /> Approve {pkg.id}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button size="lg" variant="secondary" onClick={startMeasure}>
                  <Ruler className="size-5" /> Measure
                </Button>
                <Button size="lg" variant="secondary" onClick={() => setMode("scale")}>
                  <Scale className="size-5" /> Weigh it
                </Button>
              </div>
              {current.status !== "pending" && (
                <button className="flex w-full items-center justify-center gap-1.5 pt-1 text-xs text-steel-400 hover:text-steel-100" onClick={() => record({ status: "pending", method: "calculated", dims: current.calcDims, weight: current.calcWeight })}>
                  <RotateCcw className="size-3" /> Undo
                </button>
              )}
            </div>
          )}

          {mode === "measure" && (
            <div className="mt-4 space-y-2.5">
              <div className="grid grid-cols-3 gap-2">
                <Stepper label="Length" value={form.l} unit={lenUnit(units)} step={units === "metric" ? 1 : 0.5} onChange={(v) => setForm({ ...form, l: v })} />
                <Stepper label="Width" value={form.w} unit={lenUnit(units)} step={units === "metric" ? 1 : 0.5} onChange={(v) => setForm({ ...form, w: v })} />
                <Stepper label="Height" value={form.h} unit={lenUnit(units)} step={units === "metric" ? 1 : 0.5} onChange={(v) => setForm({ ...form, h: v })} />
              </div>
              <Stepper label="Weight" value={form.wt} unit={weightUnit(units)} step={units === "metric" ? 0.1 : 0.5} onChange={(v) => setForm({ ...form, wt: v })} />
              <div className="grid grid-cols-[1fr_2fr] gap-2 pt-1">
                <Button size="lg" variant="ghost" onClick={() => setMode("idle")}>
                  Cancel
                </Button>
                <Button size="lg" onClick={saveMeasure}>
                  <Check className="size-5" /> Save measurements
                </Button>
              </div>
            </div>
          )}

          {mode === "scale" && (
            <div className="mt-4">
              <ScaleReading
                target={current.calcWeight}
                units={units}
                onDone={(g) => {
                  const off = Math.abs(g - current.calcWeight) / current.calcWeight;
                  record({ status: off > 0.01 ? "adjusted" : "approved", method: "scale", weight: g, dims: current.dims });
                  setMode("idle");
                }}
              />
            </div>
          )}
        </section>

        <section className="space-y-1">
          {checks.map((c) => {
            const p = packages.find((x) => x.id === c.id)!;
            return (
              <button
                key={c.id}
                onClick={() => set({ selected: c.id })}
                className={cn("flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs", c.id === current.id ? "bg-steel-800" : "hover:bg-steel-850")}
              >
                <span className="flex items-center gap-2">
                  <span className={cn("grid size-5 place-items-center rounded-full", c.status === "pending" ? "bg-steel-700" : c.status === "approved" ? "bg-ok text-steel-950" : "bg-signal text-signal-ink")}>
                    {c.status !== "pending" && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <b className="text-steel-100">{c.id}</b>
                  <span className="text-steel-400">{p?.container.name}</span>
                </span>
                <span className="text-steel-300">{fmtWeight(c.weight, units)}</span>
              </button>
            );
          })}
        </section>
      </div>
      <div className="border-t border-steel-700 bg-steel-900 p-4">
        <Button
          size="xl"
          className="w-full"
          disabled={approved < checks.length || saving}
          onClick={async () => {
            setSaving(true);
            await onDone();
            setSaving(false);
          }}
        >
          {saving ? <Loader2 className="size-5 animate-spin" /> : <Truck className="size-6" />}
          Get shipping rates
        </Button>
        {approved < checks.length && <p className="mt-2 text-center text-xs text-steel-400">Confirm every package to unlock rates.</p>}
      </div>
    </>
  );
}
