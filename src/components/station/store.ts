"use client";

import { create } from "zustand";
import type { OrderDetail } from "@/lib/queries";
import type { PackPlan } from "@/lib/packing/types";

export type StationStep = "pack" | "verify" | "rate" | "ship";
export type ViewPreset = "iso" | "top" | "front" | "side";

interface StationState {
  detail: OrderDetail | null;
  alternate: PackPlan | null;
  loading: boolean;
  step: StationStep;
  /** "all" shows every package side by side. */
  selected: string;
  /** How many placements of the selected package are shown (timeline position). */
  build: number;
  playing: boolean;
  xray: boolean;
  exploded: boolean;
  showDims: boolean;
  wrap: boolean;
  view: ViewPreset;
  viewNonce: number;
  hover: string | null;
  /** Pointer position (client px) while hovering something in the scene. */
  hoverAt: { x: number; y: number } | null;
  set: (p: Partial<StationState>) => void;
  setView: (v: ViewPreset) => void;
}

export const useStation = create<StationState>()((set) => ({
  detail: null,
  alternate: null,
  loading: false,
  step: "pack",
  selected: "all",
  build: 0,
  playing: false,
  xray: false,
  exploded: false,
  showDims: false,
  wrap: true,
  view: "iso",
  viewNonce: 0,
  hover: null,
  hoverAt: null,
  set: (p) => set(p),
  setView: (view) => set((s) => ({ view, viewNonce: s.viewNonce + 1 })),
}));

export function stepFromStatus(status: string): StationStep {
  if (status === "shipped") return "ship";
  if (status === "rated" || status === "verified") return "rate";
  return "pack";
}

/** Total timeline length for a package (placements). */
export function stepsFor(plan: PackPlan | undefined, id: string): number {
  if (!plan || id === "all") return 0;
  return findPackage(plan, id)?.placements.length ?? 0;
}

export function findPackage(plan: PackPlan | undefined, id: string) {
  if (!plan) return undefined;
  for (const p of plan.packages) {
    if (p.id === id) return p;
    const c = p.children.find((c) => c.id === id);
    if (c) return c;
  }
  return undefined;
}

/** The skid a carton rides on, if any. */
export function parentOf(plan: PackPlan | undefined, id: string) {
  return plan?.packages.find((p) => p.children.some((c) => c.id === id));
}
