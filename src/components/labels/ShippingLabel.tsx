import { ArrowUp, Bug, GlassWater, Snowflake } from "lucide-react";
import type { LabelDoc } from "@/lib/labels";
import { ORIGIN } from "@/lib/geo";
import type { Package } from "@/lib/packing/types";
import type { PackageCheck } from "@/lib/service";
import { dims as fmtDims, weight as fmtWeight, type Units } from "@/lib/units";
import { Barcode } from "./Barcode";

export interface LabelOrder {
  number: string;
  customer: string;
  company: string | null;
  address1: string;
  city: string;
  province: string;
  postal: string;
  phone: string | null;
}

/** 4 × 6 in thermal label, drawn at 96 dpi (384 × 576). */
export function ShippingLabel({ label, order, pkg, check, units }: { label: LabelDoc; order: LabelOrder; pkg?: Package; check?: PackageCheck; units: Units }) {
  const d = check?.dims ?? pkg?.outer;
  const w = check?.weight ?? pkg?.grossWeight ?? 0;
  const live = pkg?.handling === "live";
  const frozen = pkg?.handling === "frozen";
  const fragile = pkg?.flags.includes("fragile");
  const sort = `${order.province} ${order.postal.slice(0, 3)}`;
  return (
    <div className="label-sheet flex h-[576px] w-[384px] flex-col bg-label font-sans text-black">
      <div className="flex items-stretch border-b-[3px] border-black">
        <div className="flex-1 px-3 py-2">
          <div className="text-[9px] font-bold uppercase">From</div>
          <div className="text-[11px] leading-tight">
            {ORIGIN.name}
            <br />
            Shipping dock · {ORIGIN.city}, {ORIGIN.province} {ORIGIN.postal}
          </div>
        </div>
        <div className="grid w-[110px] place-items-center border-l-[3px] border-black bg-black text-center text-white">
          <div>
            <div className="wide text-[15px] leading-none font-black">{label.carrier.split(" ")[0]}</div>
            <div className="mt-1 text-[9px] font-semibold">{label.service}</div>
          </div>
        </div>
      </div>
      <div className="flex-1 border-b-[3px] border-black px-3 py-2">
        <div className="text-[9px] font-bold uppercase">Ship to</div>
        <div className="text-[17px] leading-tight font-bold">{order.company ?? order.customer}</div>
        {order.company && <div className="text-[13px] leading-tight">Attn: {order.customer}</div>}
        <div className="text-[15px] leading-tight">{order.address1}</div>
        <div className="text-[15px] leading-tight font-bold">
          {order.city} {order.province} {order.postal}
        </div>
        {order.phone && <div className="text-[11px]">{order.phone}</div>}
      </div>
      <div className="flex border-b-[3px] border-black">
        <div className="wide flex-1 px-3 py-1.5 text-[40px] leading-none font-black tracking-tight">{sort}</div>
        <div className="grid w-[110px] place-items-center border-l-[3px] border-black text-center">
          <div>
            <div className="text-[9px] font-bold uppercase">{label.kind === "pallet" ? "Skid" : "Piece"}</div>
            <div className="wide text-[22px] leading-none font-black">
              {label.index}/{label.count}
            </div>
          </div>
        </div>
      </div>
      <div className="border-b-[3px] border-black px-3 py-2">
        <div className="flex justify-between text-[10px] font-bold">
          <span>{label.kind === "pallet" ? "PRO #" : "TRACKING #"}</span>
          <span>{label.packageId}</span>
        </div>
        <Barcode value={label.tracking} height={70} className="mt-1 h-[70px] w-full" />
        <div className="mt-0.5 text-center font-mono text-[13px] tracking-widest">{label.tracking}</div>
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-[11px]">
        <div>
          <div>
            <b>WT</b> {fmtWeight(w, units)} {check?.method === "scale" ? "(scale)" : check?.method === "measured" ? "(measured)" : ""}
          </div>
          {d && (
            <div>
              <b>DIM</b> {fmtDims(d, units)}
            </div>
          )}
          <div>
            <b>REF</b> {order.number}
          </div>
        </div>
        <div className="flex gap-1.5">
          {(live || pkg?.flags.includes("keep-upright")) && (
            <span className="grid size-9 place-items-center border-2 border-black" title="This side up">
              <ArrowUp className="size-6" strokeWidth={3} />
            </span>
          )}
          {fragile && (
            <span className="grid size-9 place-items-center border-2 border-black" title="Fragile">
              <GlassWater className="size-6" strokeWidth={2.5} />
            </span>
          )}
          {live && (
            <span className="grid size-9 place-items-center border-2 border-black bg-black text-white" title="Live animals">
              <Bug className="size-6" strokeWidth={2.5} />
            </span>
          )}
          {frozen && (
            <span className="grid size-9 place-items-center border-2 border-black" title="Keep frozen">
              <Snowflake className="size-6" strokeWidth={2.5} />
            </span>
          )}
        </div>
      </div>
      {live && <div className="bg-black px-3 py-1 text-center text-[12px] font-black tracking-wide text-white">LIVE HARMLESS REPTILES · DO NOT FREEZE · DELIVER TODAY</div>}
    </div>
  );
}
