"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Layers3, Plus, Snowflake, Trash2 } from "lucide-react";
import type { Container } from "@/generated/prisma/client";
import { useApp } from "@/components/app-store";
import { IsoBox } from "@/components/IsoBox";
import { Button, Pill } from "@/components/ui";
import { REORDER_AT } from "@/lib/catalogue/boxes";
import { cn } from "@/lib/cn";
import type { PackOptions } from "@/lib/packing/types";
import { len, lenUnit, money, toGrams, toMm, weightUnit, weightValue, type Units } from "@/lib/units";

type Row = Container;

function Num({ label, value, unit, onChange, step = 0.25 }: { label: string; value: number; unit?: string; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="block min-w-0">
      <span className="text-[10px] text-steel-400">{label}</span>
      <div className="mt-0.5 flex h-9 items-center rounded-md border border-steel-700 bg-steel-950 pr-2 focus-within:border-signal">
        <input type="number" step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} className="w-full min-w-0 bg-transparent px-2 text-sm font-semibold text-steel-50 outline-none" />
        {unit && <span className="text-[10px] text-steel-500">{unit}</span>}
      </div>
    </label>
  );
}

function BoxCard({ row, units, scale, usage, onChange, onRemove }: { row: Row; units: Units; scale: number; usage: number; onChange: (r: Row) => void; onRemove: () => void }) {
  const wallMm = (row.outerL - row.innerL) / 2;
  const set = (patch: Partial<Row>) => onChange({ ...row, ...patch });
  const setInner = (k: "innerL" | "innerW" | "innerH", v: number) => {
    const mm = Math.round(toMm(v, units));
    const outerKey = k.replace("inner", "outer") as "outerL" | "outerW" | "outerH";
    set({ [k]: mm, [outerKey]: Math.round(mm + wallMm * 2) } as Partial<Row>);
  };
  const low = row.stock < REORDER_AT;
  return (
    <div className={cn("flex flex-col rounded-xl border bg-steel-850 p-3", row.active ? "border-steel-700" : "border-dashed border-steel-700 opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <input value={row.name} onChange={(e) => set({ name: e.target.value })} className="w-full bg-transparent text-sm font-semibold text-steel-50 outline-none" aria-label="Box name" />
          <div className="text-[11px] text-steel-500">{row.id}</div>
        </div>
        <div className="flex shrink-0 gap-1">
          {row.insulated && (
            <Pill tone="frozen">
              <Snowflake className="size-3" /> Insulated
            </Pill>
          )}
          {low && <Pill tone="warn">Low stock</Pill>}
        </div>
      </div>
      <div className="my-3 grid h-40 place-items-center">
        <IsoBox dims={{ l: row.outerL, w: row.outerW, h: row.outerH }} scale={scale} tone={row.insulated ? "eps" : "kraft"} />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Num label="Inside L" value={+len(row.innerL, units, 2)} unit={lenUnit(units)} onChange={(v) => setInner("innerL", v)} />
        <Num label="Inside W" value={+len(row.innerW, units, 2)} unit={lenUnit(units)} onChange={(v) => setInner("innerW", v)} />
        <Num label="Inside H" value={+len(row.innerH, units, 2)} unit={lenUnit(units)} onChange={(v) => setInner("innerH", v)} />
        <Num label="Max gross" value={+weightValue(row.maxGross, units).toFixed(1)} unit={weightUnit(units)} step={1} onChange={(v) => set({ maxGross: Math.round(toGrams(v, units)) })} />
        <Num label="Cost" value={row.costCents / 100} unit="$" step={0.01} onChange={(v) => set({ costCents: Math.round(v * 100) })} />
        <Num label="On hand" value={row.stock} step={1} onChange={(v) => set({ stock: Math.max(0, Math.round(v)) })} />
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-steel-400">
        <span>
          Outside {len(row.outerL, units, 1)} × {len(row.outerW, units, 1)} × {len(row.outerH, units, 1)} · used {usage}×
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={row.active} onChange={(e) => set({ active: e.target.checked })} className="accent-[#ffc531]" /> In use
          </label>
          <button onClick={onRemove} aria-label={`Remove ${row.name}`} className="text-steel-500 hover:text-bad">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function BoxEditor({ initial, options, usage }: { initial: Row[]; options: PackOptions; usage: Record<string, number> }) {
  const router = useRouter();
  const units = useApp((s) => s.units);
  const [rows, setRows] = useState(initial);
  const [opts, setOpts] = useState(options);
  const [saving, setSaving] = useState(false);
  const boxes = rows.filter((r) => r.kind === "box");
  const pallet = rows.find((r) => r.kind === "pallet");
  // One scale for every box so sizes compare honestly.
  const scale = useMemo(
    () => Math.min(...boxes.map((b) => Math.min(250 / ((b.outerL + b.outerW) * 0.866), 140 / ((b.outerL + b.outerW) * 0.5 + b.outerH)))),
    [boxes],
  );
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial) || JSON.stringify(opts) !== JSON.stringify(options);

  const update = (r: Row) => setRows((list) => list.map((x) => (x.id === r.id ? r : x)));

  function add() {
    const n = rows.filter((r) => r.kind === "box").length + 1;
    const inch = 25.4;
    setRows([
      ...rows,
      {
        id: `B-NEW${n}`,
        name: "New box 14 × 10 × 8",
        kind: "box",
        innerL: Math.round(14 * inch),
        innerW: Math.round(10 * inch),
        innerH: Math.round(8 * inch),
        outerL: Math.round(14.25 * inch),
        outerW: Math.round(10.25 * inch),
        outerH: Math.round(8.25 * inch),
        tare: 360,
        maxGross: 18_000,
        costCents: 120,
        insulated: false,
        accepts: "standard",
        stock: 100,
        coolant: null,
        deckHeight: null,
        active: true,
        sort: rows.length,
      },
    ]);
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/boxes", { method: "PUT", body: JSON.stringify({ containers: rows, options: opts }) });
    setSaving(false);
    if (!res.ok) return toast.error("Could not save", { description: JSON.stringify((await res.json()).error) });
    toast.success("Box sizes saved", { description: "The next build uses them." });
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6 pb-28 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="wide text-2xl font-black text-steel-50">Box sizes</h1>
          <p className="mt-1 max-w-2xl text-sm text-steel-300">
            The cartons, insulated shippers and skid the builder can choose from, drawn to the same scale. Sizes are inside dimensions; the outside adds the wall.
          </p>
        </div>
        <Button variant="secondary" onClick={add}>
          <Plus className="size-4" /> Add a box size
        </Button>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {boxes.map((r) => (
          <BoxCard key={r.id} row={r} units={units} scale={scale} usage={usage[r.id] ?? 0} onChange={update} onRemove={() => setRows(rows.filter((x) => x.id !== r.id))} />
        ))}
      </section>

      <section className="mt-8 grid gap-4 lg:grid-cols-2">
        {pallet && (
          <div className="rounded-xl border border-steel-700 bg-steel-850 p-4">
            <div className="flex items-center gap-2">
              <Layers3 className="size-4 text-pine" />
              <h2 className="text-sm font-semibold text-steel-50">{pallet.name}</h2>
              <span className="text-xs text-steel-500">{pallet.stock} on hand</span>
            </div>
            <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-4">
              <IsoBox dims={{ l: pallet.outerL, w: pallet.outerW, h: pallet.deckHeight ?? 140 }} scale={0.09} tone="pine" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Num label="Deck L" value={+len(pallet.innerL, units, 1)} unit={lenUnit(units)} onChange={(v) => update({ ...pallet, innerL: Math.round(toMm(v, units)), outerL: Math.round(toMm(v, units)) })} />
                <Num label="Deck W" value={+len(pallet.innerW, units, 1)} unit={lenUnit(units)} onChange={(v) => update({ ...pallet, innerW: Math.round(toMm(v, units)), outerW: Math.round(toMm(v, units)) })} />
                <Num label="Max build height" value={+len(opts.palletMaxHeight, units, 1)} unit={lenUnit(units)} onChange={(v) => setOpts({ ...opts, palletMaxHeight: Math.round(toMm(v, units)) })} />
                <Num label="Max gross" value={Math.round(weightValue(pallet.maxGross, units))} unit={weightUnit(units)} step={10} onChange={(v) => update({ ...pallet, maxGross: Math.round(toGrams(v, units)) })} />
                <Num label="Skid cost" value={pallet.costCents / 100} unit="$" step={0.5} onChange={(v) => update({ ...pallet, costCents: Math.round(v * 100) })} />
                <Num label="On hand" value={pallet.stock} step={1} onChange={(v) => update({ ...pallet, stock: Math.max(0, Math.round(v)) })} />
              </div>
            </div>
          </div>
        )}
        <div className="rounded-xl border border-steel-700 bg-steel-850 p-4">
          <h2 className="text-sm font-semibold text-steel-50">Packing rules</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Num label="Bubble wrap per side" value={+len(opts.fragilePad, units, 2)} unit={lenUnit(units)} onChange={(v) => setOpts({ ...opts, fragilePad: Math.round(toMm(v, units)) })} />
            <Num label="Support in boxes" value={Math.round(opts.minSupportBox * 100)} unit="%" step={5} onChange={(v) => setOpts({ ...opts, minSupportBox: v / 100 })} />
            <Num label="Support on skids" value={Math.round(opts.minSupportPallet * 100)} unit="%" step={5} onChange={(v) => setOpts({ ...opts, minSupportPallet: v / 100 })} />
            <Num label="Courier max" value={Math.round(weightValue(opts.parcelMaxGross, units))} unit={weightUnit(units)} step={1} onChange={(v) => setOpts({ ...opts, parcelMaxGross: Math.round(toGrams(v, units)) })} />
          </div>
          <ul className="mt-4 space-y-1 text-xs text-steel-400">
            <li>Live animals and feeders ship in insulated boxes with a heat pack, Monday–Wednesday, overnight only, and never on a skid.</li>
            <li>Glass terrariums ship in the maker&apos;s carton; nothing heavier than 25 lb goes on top of one.</li>
            <li>Fragile units are wrapped and loaded last so they ride on top.</li>
            <li>Pick-up-only items are held back from shipments.</li>
          </ul>
        </div>
      </section>

      <div className={cn("fixed inset-x-0 bottom-0 z-30 border-t border-steel-700 bg-steel-900/95 backdrop-blur transition", dirty ? "translate-y-0" : "translate-y-full")}>
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <span className="text-sm text-steel-300">Unsaved changes · {boxes.filter((b) => b.active).length} box sizes in use · cheapest {money(Math.min(...boxes.map((b) => b.costCents)))}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => (setRows(initial), setOpts(options))}>
              Discard
            </Button>
            <Button onClick={save} disabled={saving}>
              <Check className="size-4" /> Save box sizes
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
