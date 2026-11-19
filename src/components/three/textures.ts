"use client";

import { useEffect, useSyncExternalStore } from "react";
import * as THREE from "three";

// Product photos come straight from Shopify's CDN (it serves CORS headers).
// One shared cache so a SKU repeated forty times on a skid loads once.

const cache = new Map<string, THREE.Texture>();
const pending = new Map<string, Promise<THREE.Texture>>();
const loader = new THREE.TextureLoader();
loader.setCrossOrigin("anonymous");

function load(url: string): Promise<THREE.Texture> {
  const hit = pending.get(url);
  if (hit) return hit;
  const p = new Promise<THREE.Texture>((resolve, reject) => {
    loader.load(
      url,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        cache.set(url, t);
        resolve(t);
      },
      undefined,
      reject,
    );
  });
  pending.set(url, p);
  return p;
}

const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useProductTexture(url?: string): THREE.Texture | null {
  const tex = useSyncExternalStore(
    subscribe,
    () => (url ? cache.get(url) ?? null : null),
    () => null,
  );
  useEffect(() => {
    if (!url || cache.has(url)) return;
    load(url)
      .then(() => listeners.forEach((l) => l()))
      .catch(() => {});
  }, [url]);
  return tex;
}

/** A tiny procedural barcode texture for carton labels. */
let labelTex: THREE.CanvasTexture | null = null;
export function labelTexture(): THREE.CanvasTexture {
  if (labelTex) return labelTex;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 160;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fbfaf6";
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = "#111";
  g.fillRect(12, 12, 90, 14);
  g.fillRect(12, 32, 150, 6);
  g.fillRect(12, 44, 120, 6);
  let x = 14;
  let s = 7;
  while (x < 242) {
    s = (s * 9301 + 49297) % 233280;
    const w = 1 + (s % 4);
    g.fillRect(x, 70, w, 62);
    x += w + 1 + ((s >> 3) % 3);
  }
  g.fillRect(12, 140, 60, 8);
  labelTex = new THREE.CanvasTexture(c);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  return labelTex;
}
