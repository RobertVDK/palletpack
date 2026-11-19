import type { PackPlan, Package, Placement } from "./types";

// Turns placements into the words a packer reads at the bench.

function zone(p: Placement, l: number, w: number) {
  const cx = p.x + p.dx / 2;
  const cy = p.y + p.dy / 2;
  const across = cx < l / 3 ? "left" : cx > (2 * l) / 3 ? "right" : "centre";
  const depth = cy < w / 3 ? "back" : cy > (2 * w) / 3 ? "front" : "middle";
  if (across === "centre" && depth === "middle") return "dead centre";
  if (across === "centre") return `${depth} centre`;
  if (depth === "middle") return `${across} side`;
  return `${depth}-${across}`;
}

function layers(pkg: Package): number[] {
  return [...new Set(pkg.placements.map((p) => Math.round(p.z)))].sort((a, b) => a - b);
}

const TURN = ["", "turned 90°", "on its side", "on its side, turned", "on its end", "on its end, turned"];

export function stepText(plan: PackPlan, pkg: Package, index: number): { title: string; detail: string } {
  const p = pkg.placements[index];
  if (!p) return { title: "Build complete", detail: pkg.kind === "pallet" ? "Wrap the skid, band it and attach the placard." : "Fill voids, close the flaps and tape the seams." };
  const isPallet = pkg.kind === "pallet";
  const l = isPallet ? pkg.container.inner.l : pkg.container.inner.l;
  const w = isPallet ? pkg.container.inner.w : pkg.container.inner.w;
  const lv = layers(pkg).indexOf(Math.round(p.z)) + 1;
  const where = `${zone(p, l, w)}, ${lv === 1 ? (isPallet ? "on the deck" : "on the floor of the box") : `layer ${lv}`}`;
  if (isPallet) {
    const child = pkg.children.find((c) => c.id === p.refId);
    const turned = p.orientation === 1 ? ", turned 90°" : "";
    return {
      title: `Stack ${p.refId}${child ? ` · ${child.container.name}` : ""}`,
      detail: `${where}${turned}${child?.flags.includes("fragile") ? " · fragile – nothing heavy on it" : ""}`,
    };
  }
  const item = plan.items[p.refId];
  const extra: string[] = [];
  if (TURN[p.orientation]) extra.push(TURN[p.orientation]);
  if (p.pad > 0) extra.push("wrap in bubble first");
  if (item?.handling === "live") extra.push("lid vented side up");
  return { title: item?.name ?? p.refId, detail: [where, ...extra].join(" · ") };
}
