"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, ChevronDown, Leaf, Loader2, ShieldCheck, Thermometer } from "lucide-react";
import { useApp } from "@/components/app-store";
import { cn } from "@/lib/cn";
import { shortDate } from "@/lib/dates";
import type { OrderDetail } from "@/lib/queries";
import type { RateQuote } from "@/lib/rates";
import { dims as fmtDims, money, weight as fmtWeight } from "@/lib/units";
import { Button, Pill } from "@/components/ui";
import { useStation } from "./store";

const CARRIER_COLORS: Record<string, string> = {
  CPC: "#d52b1e",
  PUR: "#1f3a93",
  UPS: "#5b3a1a",
  FDX: "#4d148c",
  CAN: "#e2231a",
  LOO: "#0b6e4f",
  DNR: "#0f5fa8",
  MAN: "#c8102e",
  TST: "#2c7a3f",
  PFR: "#16307a",
};

const SHOPPING = ["Canada Post", "Purolator", "UPS", "FedEx", "Canpar", "Loomis Express", "Day & Ross", "Manitoulin", "TST-CF", "Purolator Freight"];

function Monogram({ code }: { code: string }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-lg text-[11px] font-black text-white" style={{ background: CARRIER_COLORS[code] ?? "#41505f" }}>
      {code}
    </span>
  );
}

function Shopping() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((v) => Math.min(SHOPPING.length, v + 1)), 85);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="space-y-1.5">
      {SHOPPING.map((c, i) => (
        <div key={c} className="flex items-center justify-between rounded-lg border border-steel-700 bg-steel-850 px-3 py-2 text-xs">
          <span className={i < n ? "text-steel-100" : "text-steel-500"}>{c}</span>
          {i < n ? <span className="text-ok">responded</span> : <Loader2 className="size-3.5 animate-spin text-steel-500" />}
        </div>
      ))}
    </div>
  );
}

export function RatesPanel({ onBooked }: { onBooked: (d: OrderDetail) => Promise<void> }) {
  const { detail } = useStation();
  const units = useApp((s) => s.units);
  const [quotes, setQuotes] = useState<RateQuote[] | null>(detail?.shipment?.quotes?.length ? detail.shipment.quotes : null);
  const [live, setLive] = useState<{ low: number; pack: string } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "parcel" | "ltl">("all");
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shipment = detail?.shipment;
  const hasLive = shipment?.plan.packages.some((p) => p.handling === "live");

  useEffect(() => {
    if (!detail || quotes) return;
    let alive = true;
    fetch(`/api/orders/${detail.order.id}/rates`, { method: "POST" })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        return body as { quotes: RateQuote[]; live: { low: number; pack: string } | null };
      })
      .then((b) => {
        if (!alive) return;
        setQuotes(b.quotes);
        setLive(b.live);
        setChosen((b.quotes.find((q) => q.tags.includes("best value")) ?? b.quotes[0])?.id ?? null);
      })
      .catch((e) => alive && setError(String(e.message ?? e)));
    return () => {
      alive = false;
    };
  }, [detail, quotes]);

  if (!detail || !shipment) return null;
  const modes = new Set(quotes?.map((q) => q.mode));
  const shown = (quotes ?? []).filter((q) => filter === "all" || q.mode === filter);
  // Until someone picks, the best-value quote is selected.
  const chosenId = chosen ?? (quotes?.find((q) => q.tags.includes("best value")) ?? quotes?.[0])?.id ?? null;
  const pick = quotes?.find((q) => q.id === chosenId);
  const checks = shipment.checks;

  async function book() {
    if (!pick || !detail) return;
    setBooking(true);
    const r = await fetch(`/api/orders/${detail.order.id}/book`, { method: "POST", body: JSON.stringify({ quoteId: pick.id }) });
    const body = await r.json();
    setBooking(false);
    if (!r.ok) return toast.error(body.error ?? "Booking failed");
    const used = Object.entries(body.used as Record<string, number>).map(([id, n]) => `${n}× ${id}`).join(", ");
    toast.success(`Booked ${pick.carrier} ${pick.service}`, { description: `Stock drawn: ${used}` });
    await onBooked(body.detail);
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <section className="rounded-xl border border-steel-700 bg-steel-850 p-3 text-xs">
          <div className="flex items-center justify-between text-steel-300">
            <span>
              Toronto, ON → <b className="text-steel-50">{detail.order.city}, {detail.order.province}</b>
            </span>
            <span>{detail.order.residential ? "Residential" : "Business"}</span>
          </div>
          <ul className="mt-2 space-y-1">
            {checks.map((c) => {
              const p = shipment.plan.packages.find((x) => x.id === c.id);
              return (
                <li key={c.id} className="flex justify-between text-steel-200">
                  <span>
                    <b>{c.id}</b> <span className="text-steel-400">{p?.kind === "pallet" ? "skid" : "parcel"}</span>
                  </span>
                  <span>
                    {fmtDims(c.dims, units)} · {fmtWeight(c.weight, units)}
                    {c.method !== "calculated" && <span className="ml-1 text-signal">●</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {hasLive && (
          <section className="flex gap-3 rounded-xl border border-live/30 bg-live/[0.06] p-3 text-xs text-steel-200">
            <Thermometer className="mt-0.5 size-4 shrink-0 text-live" />
            <div>
              <div className="font-semibold text-steel-50">Live animals on board</div>
              <div>
                Overnight services only, shipping Monday–Wednesday.
                {live && (
                  <>
                    {" "}
                    Destination low around <b>{live.low}°C</b>: add a <b>{live.pack}</b>.
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {error && <div className="rounded-lg border border-bad/40 bg-bad/10 p-3 text-xs text-bad">{error}</div>}
        {!quotes && !error && <Shopping />}

        {quotes && (
          <>
            {modes.size > 1 && (
              <div className="flex gap-1 text-xs">
                {(["all", "parcel", "ltl"] as const).map((f) => (
                  <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={cn("rounded-md px-2.5 py-1 font-medium", filter === f ? "bg-steel-700 text-steel-50" : "text-steel-400 hover:text-steel-100")}>
                    {f === "all" ? `All ${quotes.length}` : f === "parcel" ? "Parcel" : "LTL freight"}
                  </button>
                ))}
              </div>
            )}
            <div className="space-y-2" role="radiogroup" aria-label="Rates">
              {shown.map((q) => {
                const on = q.id === chosenId;
                return (
                  <div key={q.id} className={cn("rounded-xl border transition", on ? "border-signal bg-signal/[0.06]" : "border-steel-700 bg-steel-850 hover:border-steel-600")}>
                    <button role="radio" aria-checked={on} onClick={() => setChosen(q.id)} className="flex w-full items-center gap-3 p-3 text-left">
                      <Monogram code={q.carrierCode} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-steel-50">{q.carrier}</span>
                          {q.tags.map((t) => (
                            <Pill key={t} tone={t === "cheapest" ? "ok" : t === "fastest" ? "signal" : "kraft"}>
                              {t === "best value" ? "Best value" : t === "cheapest" ? "Cheapest" : "Fastest"}
                            </Pill>
                          ))}
                        </div>
                        <div className="truncate text-xs text-steel-300">
                          {q.service} · {q.mode === "ltl" ? "LTL" : "parcel"}
                          {q.guaranteed && (
                            <span className="ml-1 inline-flex items-center gap-0.5 text-ok">
                              <ShieldCheck className="size-3" /> guaranteed
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-steel-400">
                          <CalendarClock className="size-3" /> {shortDate(q.deliveryDate)} · {q.transitDays} business day{q.transitDays > 1 ? "s" : ""}
                          <Leaf className="ml-1.5 size-3" /> {q.co2Kg} kg CO₂e
                        </div>
                      </div>
                      <div className="wide text-right text-lg font-black text-steel-50">{money(q.totalCents)}</div>
                    </button>
                    <button onClick={() => setOpen(open === q.id ? null : q.id)} className="flex w-full items-center justify-center gap-1 border-t border-steel-700/70 py-1 text-[11px] text-steel-400 hover:text-steel-100">
                      Breakdown <ChevronDown className={cn("size-3 transition", open === q.id && "rotate-180")} />
                    </button>
                    {open === q.id && (
                      <dl className="space-y-0.5 px-3 pb-3 text-xs">
                        {q.lines.map((l, i) => (
                          <div key={i} className="flex justify-between text-steel-300">
                            <dt>{l.label}</dt>
                            <dd className="text-steel-100">{money(l.cents)}</dd>
                          </div>
                        ))}
                        {q.notes.map((n, i) => (
                          <p key={i} className="pt-1 text-[11px] text-steel-400">
                            {n}
                          </p>
                        ))}
                      </dl>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-center text-[11px] text-steel-500">Demo tariffs – prices are simulated, not live carrier quotes.</p>
          </>
        )}
      </div>
      <div className="border-t border-steel-700 bg-steel-900 p-4">
        <Button size="xl" className="w-full" disabled={!pick || booking} onClick={book}>
          {booking && <Loader2 className="size-5 animate-spin" />}
          {pick ? `Book ${pick.carrier} · ${money(pick.totalCents)}` : "Choose a rate"}
        </Button>
      </div>
    </>
  );
}
