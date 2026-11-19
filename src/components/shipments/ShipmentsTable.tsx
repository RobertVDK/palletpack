"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Box, Layers3, Printer, X } from "lucide-react";
import { useApp } from "@/components/app-store";
import { BillOfLading } from "@/components/labels/BillOfLading";
import { ShippingLabel, type LabelOrder } from "@/components/labels/ShippingLabel";
import { Button, Pill } from "@/components/ui";
import type { LabelDoc } from "@/lib/labels";
import type { PackPlan } from "@/lib/packing/types";
import type { RateQuote } from "@/lib/rates";
import type { PackageCheck } from "@/lib/service";
import { money, weight as fmtWeight } from "@/lib/units";

export interface ShipmentRow {
  id: string;
  shippedAt: string;
  mode: "boxes" | "skid";
  order: LabelOrder & { residential: boolean };
  plan: PackPlan;
  rate: RateQuote;
  labels: LabelDoc[];
  checks: PackageCheck[];
  followedAdvice: boolean;
  savingsCents: number;
  adjusted: number;
}

function Labels({ row, onClose }: { row: ShipmentRow; onClose: () => void }) {
  const units = useApp((s) => s.units);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const pallets = row.plan.packages.filter((p) => p.kind === "pallet");
  const docs = row.labels.map((l) =>
    l.kind === "pallet" ? (
      <BillOfLading key={l.packageId} labels={[l]} order={row.order} pallets={pallets.filter((p) => p.id === l.packageId)} checks={row.checks} units={units} residential={row.order.residential} />
    ) : (
      <ShippingLabel key={l.packageId} label={l} order={row.order} pkg={row.plan.packages.find((p) => p.id === l.packageId)} check={row.checks.find((c) => c.id === l.packageId)} units={units} />
    ),
  );
  return (
    <>
      <div className="no-print fixed inset-0 z-50 overflow-y-auto bg-black/75 p-6 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal aria-label={`Labels for ${row.order.number}`}>
        <div className="mx-auto flex max-w-5xl items-center justify-between pb-4" onClick={(e) => e.stopPropagation()}>
          <div className="text-steel-100">
            <div className="wide text-lg font-black">{row.order.number}</div>
            <div className="text-xs text-steel-400">
              {row.rate.carrier} · {row.rate.service}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => window.print()}>
              <Printer className="size-4" /> Print
            </Button>
            <Button variant="secondary" onClick={onClose} aria-label="Close">
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <div className="mx-auto flex max-w-5xl flex-wrap justify-center gap-4" onClick={(e) => e.stopPropagation()}>
          {docs}
        </div>
      </div>
      <div className="print-only">{docs}</div>
    </>
  );
}

export function ShipmentsTable({ rows }: { rows: ShipmentRow[] }) {
  const units = useApp((s) => s.units);
  const [open, setOpen] = useState<ShipmentRow | null>(null);
  const spend = rows.reduce((s, r) => s + (r.rate?.totalCents ?? 0), 0);
  const pieces = rows.reduce((s, r) => s + r.plan.packages.length, 0);
  const skids = rows.filter((r) => r.mode === "skid").length;
  const saved = rows.reduce((s, r) => s + r.savingsCents, 0);
  const fill = rows.length ? rows.reduce((s, r) => s + r.plan.metrics.avgFill, 0) / rows.length : 0;

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <h1 className="wide text-2xl font-black text-steel-50">Shipments</h1>
      <p className="mt-1 text-sm text-steel-300">Booked orders with their labels. Reprint any label or bill of lading.</p>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Orders shipped", rows.length.toString()],
          ["Pieces", pieces.toString()],
          ["Went LTL", `${skids} of ${rows.length}`],
          ["Average fill", `${Math.round(fill * 100)}%`],
          ["Saved vs. the other way", money(saved)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-steel-700 bg-steel-850 px-4 py-3">
            <dt className="text-xs text-steel-400">{k}</dt>
            <dd className="wide mt-0.5 text-xl font-black text-steel-50">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 overflow-x-auto rounded-xl border border-steel-700">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-steel-850 text-left text-xs text-steel-400">
            <tr>
              <th className="px-4 py-2.5 font-medium">Order</th>
              <th className="font-medium">Destination</th>
              <th className="font-medium">Build</th>
              <th className="font-medium">Carrier</th>
              <th className="font-medium">Weight</th>
              <th className="font-medium">Tracking</th>
              <th className="pr-4 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={() => setOpen(r)} className="cursor-pointer border-t border-steel-800 hover:bg-steel-850">
                <td className="px-4 py-3">
                  <div className="wide font-bold text-steel-50">{r.order.number}</div>
                  <div className="text-xs text-steel-400">
                    {new Date(r.shippedAt).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </div>
                </td>
                <td>
                  <div className="text-steel-100">{r.order.company ?? r.order.customer}</div>
                  <div className="text-xs text-steel-400">
                    {r.order.city}, {r.order.province}
                  </div>
                </td>
                <td>
                  <div className="flex items-center gap-1.5 text-steel-100">
                    {r.mode === "skid" ? <Layers3 className="size-4 text-pine" /> : <Box className="size-4 text-kraft" />}
                    {r.plan.packages.length} {r.mode === "skid" ? "incl. skid" : r.plan.packages.length > 1 ? "parcels" : "parcel"}
                  </div>
                  <div className="mt-0.5 flex gap-1">
                    {r.adjusted > 0 && <Pill tone="signal">{r.adjusted} re-measured</Pill>}
                    {r.followedAdvice && <Pill tone="ok">Recommended</Pill>}
                  </div>
                </td>
                <td>
                  <div className="text-steel-100">{r.rate?.carrier}</div>
                  <div className="text-xs text-steel-400">{r.rate?.service}</div>
                </td>
                <td className="text-steel-200">{fmtWeight(r.checks.reduce((s, c) => s + c.weight, 0), units)}</td>
                <td className="font-mono text-xs text-steel-300">
                  {r.labels.slice(0, 2).map((l) => (
                    <div key={l.packageId}>{l.pro ?? l.tracking}</div>
                  ))}
                  {r.labels.length > 2 && <div className="text-steel-500">+{r.labels.length - 2} more</div>}
                </td>
                <td className="wide pr-4 text-right font-bold text-steel-50">{r.rate ? money(r.rate.totalCents) : "—"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-steel-400">
                  Nothing shipped yet. <Link href="/" className="text-signal hover:underline">Pack an order</Link> to see it here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-steel-500">Spend shown is demo pricing. Total {money(spend)}.</p>
      {open && <Labels row={open} onClose={() => setOpen(null)} />}
    </main>
  );
}
