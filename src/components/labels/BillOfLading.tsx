import type { LabelDoc } from "@/lib/labels";
import { ORIGIN } from "@/lib/geo";
import { freightClass } from "@/lib/packing/freight";
import type { Package } from "@/lib/packing/types";
import type { PackageCheck } from "@/lib/service";
import { dims as fmtDims, weight as fmtWeight, type Units } from "@/lib/units";
import { Barcode } from "./Barcode";
import type { LabelOrder } from "./ShippingLabel";

/** Straight bill of lading for the skid portion of a shipment (demo). */
export function BillOfLading({ labels, order, pallets, checks, units, residential }: { labels: LabelDoc[]; order: LabelOrder; pallets: Package[]; checks: PackageCheck[]; units: Units; residential: boolean }) {
  const first = labels[0];
  const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
  const total = pallets.reduce((s, p) => s + (byId[p.id]?.weight ?? p.grossWeight), 0);
  return (
    <div className="label-sheet w-[720px] bg-label p-6 font-sans text-[12px] text-black">
      <div className="flex items-start justify-between border-b-2 border-black pb-3">
        <div>
          <div className="wide text-[22px] font-black">Straight Bill of Lading</div>
          <div className="text-[11px]">Not negotiable · demo document</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-bold">PRO {first?.pro}</div>
          <Barcode value={first?.pro ?? ""} height={40} className="ml-auto h-10 w-56" />
          <div className="mt-1 text-[11px]">
            BOL <b>{first?.bol}</b> · Ref {order.number}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 border-b-2 border-black py-3">
        <div>
          <div className="text-[10px] font-bold uppercase">Shipper</div>
          <div className="font-bold">{ORIGIN.name}</div>
          <div>
            {ORIGIN.city}, {ORIGIN.province} {ORIGIN.postal}
          </div>
          <div>Dock pickup · 08:00–16:00</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase">Consignee</div>
          <div className="font-bold">{order.company ?? order.customer}</div>
          <div>{order.address1}</div>
          <div>
            {order.city}, {order.province} {order.postal}
          </div>
          <div>{order.phone}</div>
        </div>
      </div>
      <div className="border-b-2 border-black py-3">
        <div className="text-[10px] font-bold uppercase">Carrier</div>
        <div className="font-bold">
          {first?.carrier} · {first?.service}
        </div>
        {residential && <div>Accessorials: residential delivery, tailgate, appointment</div>}
      </div>
      <table className="mt-3 w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black text-left text-[10px] uppercase">
            <th className="py-1">Pieces</th>
            <th>Type</th>
            <th>Description</th>
            <th>Dimensions</th>
            <th>Class</th>
            <th className="text-right">Weight</th>
          </tr>
        </thead>
        <tbody>
          {pallets.map((p) => {
            const c = byId[p.id];
            const d = c?.dims ?? p.outer;
            const w = c?.weight ?? p.grossWeight;
            return (
              <tr key={p.id} className="border-b border-black/30">
                <td className="py-1.5">1</td>
                <td>Skid</td>
                <td>
                  {p.id}: reptile supplies, {p.children.length} cartons, stretch-wrapped
                </td>
                <td>{fmtDims(d, units)}</td>
                <td>{freightClass(d, w)}</td>
                <td className="text-right">{fmtWeight(w, units)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td className="pt-2">{pallets.length}</td>
            <td colSpan={4} className="pt-2">
              Total handling units
            </td>
            <td className="pt-2 text-right">{fmtWeight(total, units)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-6 grid grid-cols-3 gap-4 text-[10px]">
        <div className="border-t border-black pt-1">Shipper signature / date</div>
        <div className="border-t border-black pt-1">Carrier signature / pickup date</div>
        <div className="border-t border-black pt-1">Consignee signature / date</div>
      </div>
    </div>
  );
}
