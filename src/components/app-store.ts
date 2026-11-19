"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Units } from "@/lib/units";

export interface QueueOrder {
  id: string;
  number: string;
  status: string;
  customer: string;
  company: string | null;
  city: string;
  province: string;
  channel: string;
  scenario: string | null;
  placedAt: string;
  units: number;
  lines: number;
  thumbs: string[];
  flags: string[];
}

interface AppState {
  units: Units;
  setUnits: (u: Units) => void;
  /** Bumped when an order arrives so the station can refresh and animate it in. */
  arrivals: QueueOrder[];
  pushArrival: (o: QueueOrder) => void;
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      units: "imperial",
      setUnits: (units) => set({ units }),
      arrivals: [],
      pushArrival: (o) => set((s) => ({ arrivals: [o, ...s.arrivals].slice(0, 20) })),
    }),
    { name: "palletpack-prefs", partialize: (s) => ({ units: s.units }) },
  ),
);
