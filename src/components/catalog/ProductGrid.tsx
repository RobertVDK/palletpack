"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, X } from "lucide-react";
import { useApp } from "@/components/app-store";
import { IsoBox } from "@/components/IsoBox";
import { Button, Pill, SourceBadge } from "@/components/ui";
import { money, len, lenUnit, toGrams, toMm, weight as fmtWeight, weightUnit, weightValue, dims as fmtDims } from "@/lib/units";

export interface GridProduct {
  id: string;
  title: string;
  url: string;
  image: string;
  category: string;
  sku: string;
  priceCents: number | null;
  dims: { l: number; w: number; h: number };
  dimsSource: string;
  dimsNote: string;
  weight: number;
  weightSource: string;
  weightNote: string;
  handling: string;
  fragile: boolean;
  keepUpright: boolean;
  shipsInOwnBox: boolean;
  pickupOnly: boolean;
  requiresShipping: boolean;
}

function Drawer({ p, onClose }: { p: GridProduct; onClose: () => void }) {
  const units = useApp((s) => s.units);
  const router = useRouter();
  const [f, setF] = useState({ l: +len(p.dims.l, units, 1), w: +len(p.dims.w, units, 1), h: +len(p.dims.h, units, 1), wt: +weightValue(p.weight, units).toFixed(2), fragile: p.fragile, upright: p.keepUpright });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/products/${encodeURIComponent(p.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        length: Math.round(toMm(f.l, units)),
        width: Math.round(toMm(f.w, units)),
        height: Math.round(toMm(f.h, units)),
        weight: Math.round(toGrams(f.wt, units)),
        fragile: f.fragile,
        keepUpright: f.upright,
      }),
    });
    setSaving(false);
    if (!res.ok) return toast.error("Could not save the measurements");
    toast.success("Measurements saved", { description: "New orders will pack with these sizes." });
    onClose();
    router.refresh();
  }

  const field = (label: string, key: "l" | "w" | "h" | "wt", unit: string) => (
    <label className="block">
      <span className="text-[11px] text-steel-400">{label}</span>
      <div className="mt-1 flex h-12 items-center rounded-lg border border-steel-600 bg-steel-950 pr-3 focus-within:border-signal">
        <input inputMode="decimal" value={f[key]} onChange={(e) => setF({ ...f, [key]: Number(e.target.value) })} className="wide w-full min-w-0 bg-transparent px-3 text-lg font-bold text-steel-50 outline-none" />
        <span className="text-xs text-steel-400">{unit}</span>
      </div>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal aria-label={p.title}>
      <div className="flex h-full w-full max-w-md flex-col border-l border-steel-700 bg-steel-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-steel-700 p-4">
          <div className="min-w-0">
            <div className="text-xs text-steel-400">{p.category}</div>
            <h2 className="text-base leading-snug font-semibold text-steel-50">{p.title}</h2>
            <div className="mt-1 text-xs text-steel-500">{p.sku}</div>
          </div>
          <button aria-label="Close" onClick={onClose} className="grid size-8 shrink-0 place-items-center rounded-md text-steel-300 hover:bg-steel-800">
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <div className="grid grid-cols-2 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.image} alt="" className="aspect-square w-full rounded-lg bg-white object-contain" />
            <div className="grid place-items-center">
              <IsoBox dims={p.dims} scale={Math.min(0.6, 140 / Math.max(p.dims.l, p.dims.w, p.dims.h))} tone="item" />
              <div className="wide mt-2 text-sm font-bold text-steel-100">{fmtDims(p.dims, units)}</div>
              <div className="text-xs text-steel-400">{fmtWeight(p.weight, units)}</div>
            </div>
          </div>
          <div className="space-y-2 rounded-lg border border-steel-700 bg-steel-850 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-steel-300">Size</span>
              <SourceBadge source={p.dimsSource} note={p.dimsNote} />
            </div>
            <p className="text-steel-400">{p.dimsNote}</p>
            <div className="flex items-center justify-between pt-1">
              <span className="text-steel-300">Weight</span>
              <SourceBadge source={p.weightSource} note={p.weightNote} />
            </div>
            <p className="text-steel-400">{p.weightNote}</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-steel-100">Measure it</h3>
            <p className="text-xs text-steel-400">Shipping size in its packaging. Saving marks the product as measured.</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {field("Length", "l", lenUnit(units))}
              {field("Width", "w", lenUnit(units))}
              {field("Height", "h", lenUnit(units))}
            </div>
            <div className="mt-2">{field("Weight", "wt", weightUnit(units))}</div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-steel-200">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={f.fragile} onChange={(e) => setF({ ...f, fragile: e.target.checked })} className="size-4 accent-[#ffc531]" /> Fragile
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={f.upright} onChange={(e) => setF({ ...f, upright: e.target.checked })} className="size-4 accent-[#ffc531]" /> Keep upright
              </label>
            </div>
          </div>
          <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-steel-400 hover:text-signal">
            View on northerngecko.net <ExternalLink className="size-3" />
          </a>
        </div>
        <div className="border-t border-steel-700 p-4">
          <Button size="xl" className="w-full" onClick={save} disabled={saving}>
            <Check className="size-5" strokeWidth={3} /> Save measurements
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ProductGrid({ products }: { products: GridProduct[] }) {
  const units = useApp((s) => s.units);
  const [open, setOpen] = useState<GridProduct | null>(null);
  if (!products.length) return <div className="rounded-xl border border-dashed border-steel-700 p-10 text-center text-sm text-steel-400">No products match. Clear a filter to see more.</div>;
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {products.map((p) => (
          <li key={p.id}>
            <button onClick={() => setOpen(p)} className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-steel-700 bg-steel-850 text-left transition hover:border-steel-500">
              <div className="relative aspect-square bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image} alt="" loading="lazy" className="size-full object-contain p-2" />
                <div className="absolute top-1.5 left-1.5 flex flex-wrap gap-1">
                  {p.handling === "live" && <Pill tone="live" className="bg-steel-900/85">Live</Pill>}
                  {p.pickupOnly && <Pill tone="warn" className="bg-steel-900/85">Pick-up only</Pill>}
                  {!p.requiresShipping && <Pill className="bg-steel-900/85">Digital</Pill>}
                </div>
              </div>
              <div className="flex flex-1 flex-col p-2.5">
                <div className="text-[10px] text-steel-500">{p.category}</div>
                <div className="line-clamp-2 text-[13px] leading-snug text-steel-100 group-hover:text-steel-50">{p.title}</div>
                <div className="mt-auto pt-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="wide truncate text-[12px] font-bold text-steel-200">
                      {len(p.dims.l, units, 1)}×{len(p.dims.w, units, 1)}×{len(p.dims.h, units, 1)}
                    </span>
                    <SourceBadge source={p.dimsSource} note={p.dimsNote} />
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[11px] text-steel-400">
                    <span>{fmtWeight(p.weight, units)}</span>
                    {p.priceCents !== null && <span className="text-steel-300">{money(p.priceCents)}</span>}
                  </div>
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {open && <Drawer p={open} onClose={() => setOpen(null)} />}
    </>
  );
}
