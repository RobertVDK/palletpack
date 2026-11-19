"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import * as THREE from "three";
import { cn } from "@/lib/cn";

// Labels for things in the 3D scene, drawn as ordinary DOM in the main React tree.
// 3D anchors project themselves to screen space every frame; the overlay reads those
// positions in a rAF loop and moves the label elements directly (no React re-render per frame).

export type LabelVariant = "tag" | "dim" | "cg" | "coolant";

export interface LabelSpec {
  id: string;
  text: string;
  sub?: string;
  variant: LabelVariant;
  align?: "center" | "right";
}

const specs = new Map<string, LabelSpec>();
const screen = new Map<string, { x: number; y: number; on: boolean }>();
const listeners = new Set<() => void>();
let snapshot: LabelSpec[] = [];

function emit() {
  snapshot = [...specs.values()];
  // Defer so a label registering from the canvas never updates the DOM tree mid-render.
  queueMicrotask(() => listeners.forEach((l) => l()));
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const getSnapshot = () => snapshot;
const empty: LabelSpec[] = [];

/** Place inside the Canvas at the point the label should point at. */
export function SceneLabel({ id: name, text, sub, variant, align, position = [0, 0, 0], show = true }: LabelSpec & { position?: [number, number, number]; show?: boolean }) {
  // Unique per instance, so a label replacing another with the same name never gets deleted by the old one's cleanup.
  const id = `${name}~${useId()}`;
  const ref = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const v = useRef(new THREE.Vector3());

  useLayoutEffect(() => {
    specs.set(id, { id, text, sub, variant, align });
    emit();
  }, [id, text, sub, variant, align]);

  useEffect(
    () => () => {
      specs.delete(id);
      screen.delete(id);
      emit();
    },
    [id],
  );

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.getWorldPosition(v.current);
    v.current.project(camera);
    const inFront = v.current.z < 1;
    screen.set(id, {
      x: ((v.current.x + 1) / 2) * size.width,
      y: ((1 - v.current.y) / 2) * size.height,
      on: show && inFront,
    });
  });

  return <group ref={ref} position={position} />;
}

/** Overlay sized to the canvas; renders every registered label and keeps them glued to their anchors. */
export function SceneLabels() {
  const list = useSyncExternalStore(subscribe, getSnapshot, () => empty);
  const els = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      for (const [id, el] of els.current) {
        const p = screen.get(id);
        if (!p || !p.on) {
          el.style.opacity = "0";
          continue;
        }
        el.style.opacity = "1";
        el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {list.map((l) => (
        <div
          key={l.id}
          ref={(el) => {
            if (el) els.current.set(l.id, el);
            else els.current.delete(l.id);
          }}
          className="absolute top-0 left-0 opacity-0 will-change-transform"
        >
          <div className={cn(l.align === "right" ? "translate-x-2 -translate-y-1/2" : "-translate-x-1/2 -translate-y-1/2")}>
            {l.variant === "tag" && (
              <div className="flex flex-col items-center">
                <div className="wide rounded-sm bg-steel-900/90 px-2 py-0.5 text-[11px] font-bold whitespace-nowrap text-signal">{l.text}</div>
                {l.sub && <div className="mt-0.5 rounded-sm bg-steel-900/80 px-1.5 text-[10px] whitespace-nowrap text-steel-300">{l.sub}</div>}
              </div>
            )}
            {l.variant === "dim" && <div className="wide rounded-sm bg-signal px-1.5 py-0.5 text-[12px] font-bold whitespace-nowrap text-signal-ink shadow-lg">{l.text}</div>}
            {l.variant === "cg" && <div className="rounded bg-signal px-1 text-[10px] font-bold text-signal-ink">{l.text}</div>}
            {l.variant === "coolant" && <div className="rounded bg-steel-900/85 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-warn">{l.text}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
