"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Printer, RotateCcw, X } from "lucide-react";
import type { QueueOrder } from "@/components/app-store";
import { useApp } from "@/components/app-store";
import { BillOfLading } from "@/components/labels/BillOfLading";
import { ShippingLabel } from "@/components/labels/ShippingLabel";
import { shortDate } from "@/lib/dates";
import type { OrderDetail } from "@/lib/queries";
import { money } from "@/lib/units";
import { Button } from "@/components/ui";
import { useStation } from "./store";

export function ShipPanel({ orders, onOpen, onReload }: { orders: QueueOrder[]; onOpen: (id: string) => void; onReload: (d?: OrderDetail) => Promise<void> }) {
  const { detail, set } = useStation();
  const units = useApp((s) => s.units);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPreview(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);
  const s = detail?.shipment;
  if (!detail || !s || !s.rate) return <div className="p-4 text-sm text-steel-400">Not booked yet.</div>;
  const o = detail.order;
  const pallets = s.plan.packages.filter((p) => p.kind === "pallet");
  const next = [...orders].reverse().find((q) => q.status !== "shipped" && q.id !== o.id);
  const pkgOf = (id: string) => s.plan.packages.find((p) => p.id === id);
  const checkOf = (id: string) => s.checks.find((c) => c.id === id);
  const parcelLabels = s.labels.filter((l) => l.kind === "parcel");
  const palletLabels = s.labels.filter((l) => l.kind === "pallet");

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <section className="rounded-2xl border border-ok/30 bg-ok/[0.07] p-4">
          <div className="flex items-center gap-2 text-ok">
            <CheckCircle2 className="size-5" />
            <span className="text-sm font-semibold">Booked</span>
          </div>
          <div className="wide mt-2 text-xl font-black text-steel-50">
            {s.rate.carrier} · {s.rate.service}
          </div>
          <div className="mt-1 text-xs text-steel-300">
            {money(s.rate.totalCents)} · arrives {shortDate(s.rate.deliveryDate)} · {s.labels.length} label{s.labels.length > 1 ? "s" : ""}
          </div>
          {palletLabels[0] && (
            <div className="mt-2 text-xs text-steel-200">
              PRO <b className="font-mono">{palletLabels[0].pro}</b> · {palletLabels[0].bol}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold text-steel-300">Labels</h3>
          <div className="grid grid-cols-2 gap-2">
            {s.labels.map((l) => (
              <button key={l.packageId} onClick={() => setPreview(l.packageId)} className="group rounded-lg border border-steel-700 bg-steel-850 p-2 text-left hover:border-signal/60">
                <div className="h-[150px] overflow-hidden rounded bg-label">
                  <div className="origin-top-left scale-[0.39]">
                    {l.kind === "pallet" ? (
                      <BillOfLading labels={[l]} order={o} pallets={pallets.filter((p) => p.id === l.packageId)} checks={s.checks} units={units} residential={o.residential} />
                    ) : (
                      <ShippingLabel label={l} order={o} pkg={pkgOf(l.packageId)} check={checkOf(l.packageId)} units={units} />
                    )}
                  </div>
                </div>
                <div className="mt-1.5 text-xs font-semibold text-steel-100">{l.packageId}</div>
                <div className="truncate font-mono text-[10px] text-steel-400">{l.tracking}</div>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="space-y-2 border-t border-steel-700 bg-steel-900 p-4">
        <Button size="xl" className="w-full" onClick={() => window.print()}>
          <Printer className="size-6" /> Print {parcelLabels.length ? `${parcelLabels.length} label${parcelLabels.length > 1 ? "s" : ""}` : ""}
          {parcelLabels.length && palletLabels.length ? " + " : ""}
          {palletLabels.length ? "BOL + placards" : ""}
        </Button>
        {next && (
          <Button size="lg" variant="secondary" className="w-full" onClick={() => onOpen(next.id)}>
            Next order {next.number} <ArrowRight className="size-4" />
          </Button>
        )}
        <button
          className="flex w-full items-center justify-center gap-1.5 pt-1 text-xs text-steel-500 hover:text-steel-200"
          onClick={async () => {
            await fetch(`/api/orders/${o.id}/reset`, { method: "POST" });
            toast("Order put back in the queue");
            await onReload();
            onOpen(o.id);
            set({ step: "pack" });
          }}
        >
          <RotateCcw className="size-3" /> Reset this order for another demo run
        </button>
      </div>

      {/* Print-only: every label at full size, one per page. Skids get the BOL plus a placard for two sides. */}
      <div className="print-only fixed inset-0 bg-white">
        {s.labels.map((l) =>
          l.kind === "pallet" ? (
            <div key={l.packageId}>
              <BillOfLading labels={[l]} order={o} pallets={pallets.filter((p) => p.id === l.packageId)} checks={s.checks} units={units} residential={o.residential} />
              <ShippingLabel label={l} order={o} pkg={pkgOf(l.packageId)} check={checkOf(l.packageId)} units={units} />
              <ShippingLabel label={l} order={o} pkg={pkgOf(l.packageId)} check={checkOf(l.packageId)} units={units} />
            </div>
          ) : (
            <ShippingLabel key={l.packageId} label={l} order={o} pkg={pkgOf(l.packageId)} check={checkOf(l.packageId)} units={units} />
          ),
        )}
      </div>

      {preview && (
        <div className="no-print fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setPreview(null)} role="dialog" aria-modal>
          <div className="relative max-h-full overflow-auto rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button aria-label="Close preview" onClick={() => setPreview(null)} className="fixed top-4 right-4 z-10 grid size-10 place-items-center rounded-full bg-steel-800 text-white hover:bg-steel-700">
              <X className="size-4" />
            </button>
            {(() => {
              const l = s.labels.find((x) => x.packageId === preview)!;
              return l.kind === "pallet" ? (
                <BillOfLading labels={[l]} order={o} pallets={pallets.filter((p) => p.id === l.packageId)} checks={s.checks} units={units} residential={o.residential} />
              ) : (
                <ShippingLabel label={l} order={o} pkg={pkgOf(l.packageId)} check={checkOf(l.packageId)} units={units} />
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}
