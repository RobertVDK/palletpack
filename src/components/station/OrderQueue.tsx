"use client";

import { useState } from "react";
import type { QueueOrder } from "@/components/app-store";
import { cn } from "@/lib/cn";
import { timeAgo } from "@/lib/dates";
import { Pill } from "@/components/ui";

const FILTERS = [
  { key: "open", label: "To pack" },
  { key: "shipped", label: "Shipped" },
  { key: "all", label: "All" },
] as const;

const STATUS: Record<string, { label: string; tone: "neutral" | "signal" | "ok" | "warn" }> = {
  new: { label: "New", tone: "signal" },
  planned: { label: "Built", tone: "neutral" },
  verified: { label: "Verified", tone: "neutral" },
  rated: { label: "Rated", tone: "neutral" },
  shipped: { label: "Shipped", tone: "ok" },
};

export function OrderQueue({ orders, fresh, activeId, onOpen }: { orders: QueueOrder[]; fresh: string[]; activeId?: string; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("open");
  const shown = orders.filter((o) => (filter === "all" ? true : filter === "shipped" ? o.status === "shipped" : o.status !== "shipped"));
  const waiting = orders.filter((o) => o.status !== "shipped").length;

  return (
    <aside className="hidden min-h-0 flex-col border-r border-steel-700 bg-steel-900 lg:flex">
      <div className="flex items-end justify-between px-4 pt-4 pb-3">
        <div>
          <h2 className="wide text-sm font-bold text-steel-50">Orders</h2>
          <p className="text-xs text-steel-400">{waiting} waiting to pack</p>
        </div>
        <div className="flex gap-0.5 rounded-md bg-steel-850 p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn("rounded px-2 py-1 text-[11px] font-medium", filter === f.key ? "bg-steel-700 text-steel-50" : "text-steel-400 hover:text-steel-100")}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <ol className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2.5 pb-4">
        {shown.map((o) => {
          const active = o.id === activeId;
          const s = STATUS[o.status] ?? STATUS.new;
          return (
            <li key={o.id}>
              <button
                onClick={() => onOpen(o.id)}
                className={cn(
                  "group relative w-full rounded-lg border px-3 py-2.5 text-left transition",
                  active ? "border-steel-500 bg-steel-800" : "border-transparent hover:border-steel-700 hover:bg-steel-850",
                  fresh.includes(o.id) && "animate-arrive border-signal/60",
                )}
              >
                {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-signal" />}
                <div className="flex items-center justify-between gap-2">
                  <span className="wide text-[13px] font-bold text-steel-50">{o.number}</span>
                  <Pill tone={s.tone}>{s.label}</Pill>
                </div>
                <div className="mt-0.5 truncate text-[13px] text-steel-200">{o.company ?? o.customer}</div>
                <div className="flex items-center justify-between text-[11px] text-steel-400">
                  <span className="truncate">
                    {o.city}, {o.province}
                  </span>
                  <span className="shrink-0">{timeAgo(o.placedAt)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex -space-x-1.5">
                    {o.thumbs.map((t, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={t} alt="" loading="lazy" className="size-7 rounded-md border-2 border-steel-850 bg-white object-contain" />
                    ))}
                    {o.lines > o.thumbs.length && (
                      <span className="grid size-7 place-items-center rounded-md border-2 border-steel-850 bg-steel-700 text-[10px] text-steel-200">+{o.lines - o.thumbs.length}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {o.flags.includes("live") && <Pill tone="live">Live</Pill>}
                    {o.flags.includes("skid") && <Pill tone="kraft">Skid</Pill>}
                    {o.flags.includes("bulky") && !o.flags.includes("skid") && <Pill>Bulky</Pill>}
                    <Pill>{o.units} u</Pill>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
        {!shown.length && (
          <li className="rounded-lg border border-dashed border-steel-700 p-4 text-center text-xs text-steel-400">
            Nothing here. Use “Simulate incoming order” to drop one in.
          </li>
        )}
      </ol>
    </aside>
  );
}
