"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Inbox, Loader2 } from "lucide-react";
import { useApp, type QueueOrder } from "@/components/app-store";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "Pack station" },
  { href: "/catalog", label: "Catalogue" },
  { href: "/boxes", label: "Box sizes" },
  { href: "/shipments", label: "Shipments" },
];

export function Mark({ className }: { className?: string }) {
  // Isometric carton on a skid: the product in one glyph.
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d="M16 3 27 9v10l-11 6-11-6V9z" fill="#c8a27a" />
      <path d="M16 15 27 9v10l-11 6z" fill="#a9845d" />
      <path d="M16 15 5 9l11-6 11 6z" fill="#dcbb94" />
      <path d="M10.5 6 21.5 12v3.5" stroke="#ffc531" strokeWidth="2" fill="none" />
      <path d="M3 24l13 6 13-6" stroke="#ffc531" strokeWidth="2.2" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { units, setUnits, pushArrival } = useApp();
  const [busy, setBusy] = useState(false);

  async function simulate() {
    setBusy(true);
    try {
      const res = await fetch("/api/orders/simulate", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const order = (await res.json()) as QueueOrder;
      pushArrival(order);
      toast(`Order ${order.number} received`, {
        description: `${order.company ?? order.customer} · ${order.city}, ${order.province} · ${order.units} units`,
        action: { label: "Pack it", onClick: () => router.push(`/?order=${order.id}`) },
      });
      if (pathname !== "/") router.push(`/?order=${order.id}`);
    } catch (e) {
      toast.error("Could not create a demo order", { description: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="no-print sticky top-0 z-40 border-b border-steel-700 bg-steel-900/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 sm:gap-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Mark className="size-8" />
          <span className="wide hidden text-[15px] font-bold tracking-tight text-steel-50 sm:inline">PalletPack</span>
          <span className="hidden text-xs text-steel-400 lg:inline">Northern Gecko · Toronto dock</span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Main">
          {NAV.map((n) => {
            const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "relative shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors",
                  active ? "text-steel-50" : "text-steel-400 hover:bg-steel-800 hover:text-steel-100",
                )}
              >
                {n.label}
                {active && <span className="absolute inset-x-3 -bottom-[11px] h-0.5 bg-signal" />}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden rounded-md border border-steel-700 p-0.5 text-xs sm:flex" role="group" aria-label="Units">
            {(["imperial", "metric"] as const).map((u) => (
              <button
                key={u}
                onClick={() => setUnits(u)}
                aria-pressed={units === u}
                className={cn("rounded px-2 py-1", units === u ? "bg-steel-700 text-steel-50" : "text-steel-400 hover:text-steel-100")}
              >
                {u === "imperial" ? "in · lb" : "cm · kg"}
              </button>
            ))}
          </div>
          <button
            onClick={simulate}
            disabled={busy}
            className="flex items-center gap-2 rounded-md bg-signal px-3 py-2 text-sm font-semibold text-signal-ink transition hover:bg-signal-hover disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Inbox className="size-4" />}
            <span className="hidden sm:inline">Simulate incoming order</span>
            <span className="sm:hidden">New order</span>
          </button>
        </div>
      </div>
    </header>
  );
}
