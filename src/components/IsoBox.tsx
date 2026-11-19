import type { Dims } from "@/lib/packing/types";

/** Isometric carton drawn to scale. `scale` maps mm to px; keep it shared across a list so sizes compare honestly. */
export function IsoBox({ dims, scale, tone = "kraft", className }: { dims: Dims; scale: number; tone?: "kraft" | "eps" | "pine" | "item"; className?: string }) {
  const c = Math.cos(Math.PI / 6);
  const s = Math.sin(Math.PI / 6);
  const L = dims.l * scale;
  const W = dims.w * scale;
  const H = dims.h * scale;
  // Projected corners (x right-down along L, y left-down along W, z up).
  const p = (x: number, y: number, z: number) => [(x - y) * c, (x + y) * s - z] as const;
  const pts = {
    top: [p(0, 0, H), p(L, 0, H), p(L, W, H), p(0, W, H)],
    left: [p(0, W, H), p(L, W, H), p(L, W, 0), p(0, W, 0)],
    right: [p(L, 0, H), p(L, W, H), p(L, W, 0), p(L, 0, 0)],
  };
  const all = [...pts.top, ...pts.left, ...pts.right, p(0, 0, 0)];
  const minX = Math.min(...all.map((q) => q[0]));
  const maxX = Math.max(...all.map((q) => q[0]));
  const minY = Math.min(...all.map((q) => q[1]));
  const maxY = Math.max(...all.map((q) => q[1]));
  const poly = (list: readonly (readonly [number, number])[]) => list.map((q) => `${q[0] - minX + 2},${q[1] - minY + 2}`).join(" ");
  const fills = {
    kraft: ["#dcbb94", "#b48c62", "#c8a27a"],
    eps: ["#f2f3ee", "#cfd3cc", "#e2e5df"],
    pine: ["#e6c99d", "#bf9d6c", "#d9b98a"],
    item: ["#aeb8c6", "#7f8a9b", "#97a2b2"],
  }[tone];
  const stroke = tone === "eps" ? "#8f978e" : "#6e5236";
  // Tape seam along the top, for cartons.
  const seam = [p(0, W / 2, H), p(L, W / 2, H)];
  return (
    <svg viewBox={`0 0 ${maxX - minX + 4} ${maxY - minY + 4}`} width={maxX - minX + 4} height={maxY - minY + 4} className={className} aria-hidden>
      <polygon points={poly(pts.left)} fill={fills[1]} stroke={stroke} strokeWidth={0.8} />
      <polygon points={poly(pts.right)} fill={fills[2]} stroke={stroke} strokeWidth={0.8} />
      <polygon points={poly(pts.top)} fill={fills[0]} stroke={stroke} strokeWidth={0.8} />
      {tone === "kraft" && <polyline points={poly(seam)} stroke="#e9cf98" strokeWidth={Math.max(1.5, W * 0.12)} opacity={0.9} />}
    </svg>
  );
}
