"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { Box, ChevronDown, ChevronUp, Eye, Layers3, Loader2, Maximize2, Package2, Pause, Play, Ruler, ScanEye, SkipBack, SkipForward } from "lucide-react";
import type { QueueOrder } from "@/components/app-store";
import { useApp } from "@/components/app-store";
import { cn } from "@/lib/cn";
import { stepText } from "@/lib/packing/instructions";
import { dims as fmtDims, weight as fmtWeight } from "@/lib/units";
import { FlagIcons, Pill, SourceBadge } from "@/components/ui";
import { SceneLabels } from "@/components/three/scene-labels";
import { findPackage, parentOf, useStation, type StationStep, type ViewPreset } from "./store";

const PackScene = dynamic(() => import("@/components/three/PackScene"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center text-sm text-steel-400">
      <Loader2 className="size-5 animate-spin" />
    </div>
  ),
});

const STEPS: { key: StationStep; label: string }[] = [
  { key: "pack", label: "Build" },
  { key: "verify", label: "Verify" },
  { key: "rate", label: "Rate" },
  { key: "ship", label: "Ship" },
];

function Stepper() {
  const step = useStation((s) => s.step);
  const set = useStation((s) => s.set);
  const detail = useStation((s) => s.detail);
  const idx = STEPS.findIndex((s) => s.key === step);
  const status = detail?.order.status ?? "new";
  const reachable: Record<StationStep, boolean> = {
    pack: status !== "shipped",
    verify: status !== "new" && status !== "shipped",
    rate: status === "verified" || status === "rated",
    ship: status === "shipped",
  };
  return (
    <ol className="flex items-center gap-1" aria-label="Fulfilment steps">
      {STEPS.map((s, i) => {
        const done = i < idx || status === "shipped";
        const current = i === idx;
        return (
          <li key={s.key} className="flex items-center gap-1">
            <button
              disabled={!reachable[s.key] || current}
              onClick={() => set({ step: s.key })}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-xs font-semibold transition",
                current ? "bg-signal text-signal-ink" : done ? "text-steel-200 hover:bg-steel-800" : "text-steel-500",
              )}
            >
              <span className={cn("grid size-5 place-items-center rounded-full text-[11px]", current ? "bg-signal-ink/15" : done ? "bg-ok/20 text-ok" : "bg-steel-800")}>
                {done && !current ? "✓" : i + 1}
              </span>
              {s.label}
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-3 bg-steel-700" />}
          </li>
        );
      })}
    </ol>
  );
}

function PackageChips() {
  const { detail, selected, set, step } = useStation();
  const plan = detail?.shipment?.plan;
  if (!plan) return null;
  const parent = parentOf(plan, selected);
  const choose = (id: string) => {
    const p = findPackage(plan, id);
    set({ selected: id, build: p ? p.placements.length : 0, playing: false, exploded: false });
  };
  return (
    <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
      <button
        onClick={() => set({ selected: "all", playing: false })}
        className={cn("shrink-0 rounded-md border px-2.5 py-1 text-xs font-semibold backdrop-blur", selected === "all" ? "border-signal bg-signal/15 text-signal" : "border-steel-600 bg-steel-900/70 text-steel-200 hover:border-steel-500")}
      >
        All {plan.packages.length}
      </button>
      {plan.packages.map((p) => (
        <button
          key={p.id}
          onClick={() => choose(p.id)}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold backdrop-blur",
            selected === p.id || parent?.id === p.id ? "border-signal bg-signal/15 text-signal" : "border-steel-600 bg-steel-900/70 text-steel-200 hover:border-steel-500",
          )}
        >
          {p.kind === "pallet" ? <Layers3 className="size-3.5" /> : <Box className="size-3.5" />}
          {p.id}
          {p.handling === "live" && <span className="size-1.5 rounded-full bg-live" />}
          {step === "verify" && detail?.shipment?.checks.find((c) => c.id === p.id)?.status !== "pending" && <span className="text-ok">✓</span>}
        </button>
      ))}
      {parent && (
        <span className="shrink-0 rounded-md bg-steel-900/80 px-2 py-1 text-xs text-steel-300 backdrop-blur">
          Inside {parent.id}: <b className="text-steel-50">{selected}</b>
        </span>
      )}
    </div>
  );
}

function ViewTools() {
  const { selected, detail, xray, exploded, showDims, wrap, view, set, setView } = useStation();
  const pkg = findPackage(detail?.shipment?.plan, selected);
  const tool = (on: boolean, label: string, icon: React.ReactNode, onClick: () => void, disabled?: boolean) => (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      title={label}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap transition disabled:opacity-35",
        on ? "bg-signal text-signal-ink" : "text-steel-200 hover:bg-steel-700",
      )}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  );
  return (
    <div className="pointer-events-auto flex shrink-0 flex-row items-start gap-1.5 sm:flex-col sm:items-end">
      <div className="flex gap-0.5 rounded-lg border border-steel-600 bg-steel-900/75 p-0.5 backdrop-blur">
        {(["iso", "top", "front", "side"] as ViewPreset[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn("rounded-md px-2 py-1 text-xs font-medium capitalize", view === v ? "bg-steel-700 text-steel-50" : "text-steel-300 hover:text-steel-50")}
          >
            {v === "iso" ? "3D" : v}
          </button>
        ))}
      </div>
      <div className="flex gap-0.5 rounded-lg border border-steel-600 bg-steel-900/75 p-0.5 backdrop-blur">
        {tool(xray, "X-ray", <ScanEye className="size-3.5" />, () => set({ xray: !xray }), pkg?.kind !== "pallet")}
        {tool(exploded, "Explode", <Maximize2 className="size-3.5" />, () => set({ exploded: !exploded }), !pkg || pkg.kind === "own")}
        {tool(showDims, "Dimensions", <Ruler className="size-3.5" />, () => set({ showDims: !showDims }), !pkg)}
        {tool(wrap, "Wrap", <Eye className="size-3.5" />, () => set({ wrap: !wrap }), pkg?.kind !== "pallet")}
      </div>
    </div>
  );
}

function Timeline() {
  const { detail, selected, build, playing, set } = useStation();
  const plan = detail?.shipment?.plan;
  const pkg = findPackage(plan, selected);
  const total = pkg?.placements.length ?? 0;

  // Playback: step through the package, then move on to the next top-level package.
  useEffect(() => {
    if (!playing || !plan || !pkg) return;
    const interval = Math.min(520, Math.max(110, 4200 / Math.max(1, total)));
    if (build < total) {
      const t = setTimeout(() => set({ build: build + 1 }), build === 0 ? 450 : interval);
      return () => clearTimeout(t);
    }
    const order = plan.packages.map((p) => p.id);
    const i = order.indexOf(selected);
    const t = setTimeout(() => {
      if (i >= 0 && i < order.length - 1) set({ selected: order[i + 1], build: 0 });
      else set({ playing: false });
    }, 1100);
    return () => clearTimeout(t);
  }, [playing, build, total, plan, pkg, selected, set]);

  if (!plan || !pkg) {
    return (
      <div className="pointer-events-auto rounded-xl border border-steel-600 bg-steel-900/80 px-4 py-3 text-xs text-steel-300 backdrop-blur">
        {plan ? "Every package for this order. Pick one to watch it being built." : ""}
      </div>
    );
  }
  const txt = stepText(plan, pkg, Math.max(0, build - 1));
  const done = build >= total;
  const cur = done ? stepText(plan, pkg, total) : txt;
  return (
    <div className="pointer-events-auto w-full rounded-xl border border-steel-600 bg-steel-900/85 p-2.5 backdrop-blur">
      <div className="flex items-center gap-2">
        <button aria-label="Back one step" onClick={() => set({ build: Math.max(0, build - 1), playing: false })} className="grid size-8 place-items-center rounded-md text-steel-300 hover:bg-steel-700">
          <SkipBack className="size-4" />
        </button>
        <button
          aria-label={playing ? "Pause" : "Play build"}
          onClick={() => set({ playing: !playing, build: done && !playing ? 0 : build })}
          className="grid size-9 place-items-center rounded-full bg-signal text-signal-ink hover:bg-signal-hover"
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
        </button>
        <button aria-label="Forward one step" onClick={() => set({ build: Math.min(total, build + 1), playing: false })} className="grid size-8 place-items-center rounded-md text-steel-300 hover:bg-steel-700">
          <SkipForward className="size-4" />
        </button>
        <input
          type="range"
          min={0}
          max={total}
          value={build}
          onChange={(e) => set({ build: Number(e.target.value), playing: false })}
          className="mx-1 h-1.5 flex-1 cursor-pointer accent-[#ffc531]"
          aria-label="Build step"
        />
        <span className="wide w-16 shrink-0 text-right text-xs font-bold text-steel-100">
          {build}/{total}
        </span>
      </div>
      <div className="mt-1.5 flex min-h-[34px] items-start gap-2 px-1">
        <span className={cn("mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold", done ? "bg-ok/20 text-ok" : "bg-signal/15 text-signal")}>
          {done ? "DONE" : `STEP ${build}`}
        </span>
        <div className="min-w-0 text-xs leading-snug">
          <div className="truncate font-semibold text-steel-50">{build === 0 && !done ? "Ready – press play or step through" : cur.title}</div>
          <div className="truncate text-steel-400">{build === 0 && !done ? `${pkg.container.name} · ${total} placements` : cur.detail}</div>
        </div>
      </div>
    </div>
  );
}

function ItemsStrip() {
  const detail = useStation((s) => s.detail);
  const units = useApp((s) => s.units);
  const [open, setOpen] = useState(false);
  if (!detail) return null;
  const units_ = detail.lines.reduce((s, l) => s + l.qty, 0);
  const estimated = detail.lines.filter((l) => l.product.dimsSource === "estimated").length;
  return (
    <div className="border-t border-steel-700 bg-steel-900">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-2 text-left text-xs text-steel-300 hover:text-steel-50" aria-expanded={open}>
        <span>
          <b className="text-steel-100">{detail.lines.length} lines</b> · {units_} units
          {estimated > 0 && <span className="ml-2 text-warn">{estimated} with estimated dimensions</span>}
        </span>
        {open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
      </button>
      {open && (
        <div className="max-h-56 overflow-y-auto px-3 pb-3">
          <table className="w-full text-xs">
            <thead className="text-left text-[11px] text-steel-500">
              <tr>
                <th className="py-1 pl-1 font-medium">Item</th>
                <th className="font-medium">Qty</th>
                <th className="font-medium">Size</th>
                <th className="font-medium">Weight</th>
                <th className="font-medium">Handling</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((l) => (
                <tr key={l.id} className="border-t border-steel-800 align-middle">
                  <td className="py-1.5 pl-1">
                    <div className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={l.product.image} alt="" className="size-8 shrink-0 rounded bg-white object-contain" loading="lazy" />
                      <a href={l.product.url} target="_blank" rel="noreferrer" className="line-clamp-1 text-steel-100 hover:text-signal">
                        {l.product.title}
                      </a>
                    </div>
                  </td>
                  <td className="wide font-bold text-steel-50">{l.qty}</td>
                  <td>
                    <div className="flex items-center gap-1.5 whitespace-nowrap text-steel-200">
                      {fmtDims(l.product.dims, units)} <SourceBadge source={l.product.dimsSource} note={l.product.dimsNote} />
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5 whitespace-nowrap text-steel-200">
                      {fmtWeight(l.product.weight, units)} <SourceBadge source={l.product.weightSource} note={l.product.weightNote} />
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {l.product.handling === "live" && <Pill tone="live">Live</Pill>}
                      {l.product.fragile && <Pill tone="bad">Fragile</Pill>}
                      {l.product.keepUpright && <Pill>Upright</Pill>}
                      {l.product.shipsInOwnBox && <Pill tone="kraft">Own box</Pill>}
                      {l.product.pickupOnly && <Pill tone="warn">Pick-up only</Pill>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Follows the pointer over the 3D scene: what is under it, its size and handling. */
function HoverCard() {
  const { hover, hoverAt, detail } = useStation();
  const units = useApp((s) => s.units);
  const plan = detail?.shipment?.plan;
  if (!hover || !hoverAt || !plan) return null;
  const item = plan.items[hover];
  const pkg = item ? undefined : findPackage(plan, hover);
  if (!item && !pkg) return null;
  return (
    <div className="pointer-events-none fixed z-30 w-64 rounded-lg border border-steel-600 bg-steel-850/95 p-2.5 shadow-2xl backdrop-blur" style={{ left: hoverAt.x + 16, top: hoverAt.y + 12 }}>
      {item ? (
        <>
          <div className="flex gap-2.5">
            {item.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image} alt="" className="size-12 shrink-0 rounded bg-white object-contain" />
            )}
            <div className="min-w-0">
              <div className="line-clamp-2 text-[12px] leading-snug font-medium text-steel-50">{item.name}</div>
              <div className="mt-1 text-[11px] text-steel-300">{fmtDims(item.dims, units)}</div>
              <div className="text-[11px] text-steel-300">{fmtWeight(item.weight, units)}</div>
            </div>
          </div>
          {(item.fragile || item.keepUpright || item.handling !== "standard") && (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.handling === "live" && <Pill tone="live">Live</Pill>}
              {item.fragile && <Pill tone="bad">Fragile · wrapped</Pill>}
              {item.keepUpright && <Pill>Keep upright</Pill>}
            </div>
          )}
        </>
      ) : (
        pkg && (
          <div className="text-[12px]">
            <div className="flex items-center justify-between">
              <b className="text-signal">{pkg.id}</b>
              <FlagIcons flags={pkg.flags} />
            </div>
            <div className="text-steel-200">{pkg.container.name}</div>
            <div className="text-steel-400">
              {fmtDims(pkg.outer, units)} · {fmtWeight(pkg.grossWeight, units)} · {pkg.itemIds.length} units
            </div>
          </div>
        )
      )}
    </div>
  );
}

export function Workspace({ orders, onOpen }: { orders: QueueOrder[]; onOpen: (id: string) => void }) {
  const { detail, loading, selected } = useStation();
  const units = useApp((s) => s.units);
  const plan = detail?.shipment?.plan;
  const pkg = findPackage(plan, selected);
  const o = detail?.order;
  const placed = useMemo(() => (o ? new Date(o.placedAt).toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" }) : ""), [o]);

  return (
    <section className="flex h-[78dvh] min-h-0 min-w-0 flex-col bg-steel-950 lg:h-auto">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-steel-700 bg-steel-900 px-4 py-2.5">
        <div className="min-w-0">
          {/* Small screens get a picker instead of the queue column. */}
          <select
            className="mb-1 w-full rounded-md border border-steel-700 bg-steel-850 px-2 py-1 text-xs lg:hidden"
            value={o?.id ?? ""}
            onChange={(e) => onOpen(e.target.value)}
            aria-label="Choose order"
          >
            {orders.map((q) => (
              <option key={q.id} value={q.id}>
                {q.number} · {q.company ?? q.customer} · {q.status}
              </option>
            ))}
          </select>
          {o ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h1 className="wide text-lg font-bold text-steel-50">{o.number}</h1>
                <span className="truncate text-sm text-steel-200">{o.company ?? o.customer}</span>
                <span className="text-sm text-steel-400">
                  → {o.city}, {o.province} {o.postal}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-steel-400">
                <Pill>{o.channel === "wholesale" ? "Wholesale" : o.channel === "api" ? "API" : o.channel === "phone" ? "Phone order" : "Web store"}</Pill>
                {o.scenario && <span>{o.scenario}</span>}
                <span>· placed {placed}</span>
                {!o.residential && <Pill tone="neutral">Business · dock</Pill>}
                {o.note && <Pill tone="signal">“{o.note}”</Pill>}
              </div>
            </>
          ) : (
            <div className="h-10" />
          )}
        </div>
        <Stepper />
      </header>

      <div className="relative min-h-[340px] flex-1">
        <div className="absolute inset-0">
          <PackScene />
          <SceneLabels />
        </div>
        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-steel-950/40 backdrop-blur-[1px]">
            <div className="flex items-center gap-3 rounded-xl border border-steel-600 bg-steel-900/90 px-4 py-3 text-sm text-steel-100">
              <Loader2 className="size-4 animate-spin text-signal" /> Planning the build…
            </div>
          </div>
        )}
        {!loading && detail && !plan && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="tape rounded-xl p-1">
              <div className="rounded-lg bg-steel-900 px-6 py-4 text-center text-sm text-steel-200">Nothing to ship on this order.</div>
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <PackageChips />
          <ViewTools />
        </div>
        {pkg && (
          <div className="pointer-events-none absolute top-14 left-3 hidden max-w-[260px] rounded-lg border border-steel-700 bg-steel-900/75 px-3 py-2 backdrop-blur md:block">
            <div className="flex items-center gap-2 text-xs">
              <Package2 className="size-3.5 text-kraft" />
              <span className="font-semibold text-steel-50">{pkg.container.name}</span>
            </div>
            <div className="wide mt-1 text-[15px] font-bold text-steel-50">{fmtDims(pkg.outer, units)}</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-steel-300">
              {fmtWeight(pkg.grossWeight, units)} · {Math.round(pkg.fill * 100)}% full
              <FlagIcons flags={pkg.flags} />
            </div>
          </div>
        )}
        <HoverCard />
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
          <div className="w-full max-w-3xl">
            <Timeline />
          </div>
        </div>
      </div>
      <ItemsStrip />
    </section>
  );
}
