"use client";

import { ArrowUpFromLine, Bug, Flame, GlassWater, Layers, Snowflake, Weight, Wind } from "lucide-react";
import { cn } from "@/lib/cn";

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "ok" | "danger"; size?: "sm" | "md" | "lg" | "xl" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition select-none disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-5 text-[15px]",
        size === "xl" && "h-16 px-6 text-lg",
        variant === "primary" && "bg-signal text-signal-ink hover:bg-signal-hover active:translate-y-px",
        variant === "secondary" && "border border-steel-600 bg-steel-800 text-steel-100 hover:border-steel-500 hover:bg-steel-750",
        variant === "ghost" && "text-steel-300 hover:bg-steel-800 hover:text-steel-50",
        variant === "ok" && "bg-ok text-steel-950 hover:brightness-110",
        variant === "danger" && "bg-bad text-white hover:brightness-110",
        className,
      )}
    />
  );
}

export function Pill({ tone = "neutral", className, children }: { tone?: "neutral" | "signal" | "ok" | "warn" | "bad" | "live" | "frozen" | "kraft"; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        tone === "neutral" && "bg-steel-750 text-steel-300",
        tone === "signal" && "bg-signal/15 text-signal",
        tone === "ok" && "bg-ok/15 text-ok",
        tone === "warn" && "bg-warn/15 text-warn",
        tone === "bad" && "bg-bad/15 text-bad",
        tone === "live" && "bg-live/15 text-live",
        tone === "frozen" && "bg-frozen/15 text-frozen",
        tone === "kraft" && "bg-kraft/15 text-kraft",
        className,
      )}
    >
      {children}
    </span>
  );
}

const FLAG_META: Record<string, { icon: React.ElementType; label: string; tone: string }> = {
  fragile: { icon: GlassWater, label: "Fragile", tone: "text-bad" },
  "keep-upright": { icon: ArrowUpFromLine, label: "This side up", tone: "text-steel-300" },
  live: { icon: Bug, label: "Live animals", tone: "text-live" },
  frozen: { icon: Snowflake, label: "Frozen", tone: "text-frozen" },
  heavy: { icon: Weight, label: "Team lift (over 50 lb)", tone: "text-warn" },
  oversize: { icon: Layers, label: "Additional handling", tone: "text-warn" },
  "no-fit": { icon: Wind, label: "No stock box fits", tone: "text-warn" },
  "off-center": { icon: Flame, label: "Off-centre load", tone: "text-warn" },
};

export function FlagIcons({ flags, className }: { flags: string[]; className?: string }) {
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      {flags
        .filter((f) => FLAG_META[f])
        .map((f) => {
          const m = FLAG_META[f];
          const I = m.icon;
          return (
            <span key={f} title={m.label} aria-label={m.label} className={m.tone}>
              <I className="size-3.5" />
            </span>
          );
        })}
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { value: T; label: React.ReactNode }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn("inline-flex rounded-lg border border-steel-700 bg-steel-850 p-0.5", className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-semibold transition",
            value === o.value ? "bg-steel-700 text-steel-50 shadow" : "text-steel-400 hover:text-steel-100",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11px] text-steel-400">{label}</div>
      <div className="wide truncate text-lg leading-tight font-bold text-steel-50">{value}</div>
      {sub && <div className="truncate text-[11px] text-steel-400">{sub}</div>}
    </div>
  );
}

export function SourceBadge({ source, note }: { source: string; note?: string }) {
  if (source === "listing") return <Pill tone="ok">Listed</Pill>;
  if (source === "measured") return <Pill tone="signal">Measured</Pill>;
  return (
    <span title={note} className="cursor-help">
      <Pill tone="warn">Estimated</Pill>
    </span>
  );
}
