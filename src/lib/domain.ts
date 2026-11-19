import type { Container, Product } from "@/generated/prisma/client";
import { DEFAULT_OPTIONS, type ContainerSpec, type Handling, type PackItem, type PackOptions } from "./packing/types";

// Conversions between database rows and the packing engine's types.

export const CATEGORY_COLORS: Record<string, string> = {
  "Live animals": "#6FBF73",
  "Live feeders": "#8FBF5A",
  "Frozen feeders": "#7FC8F8",
  Enclosures: "#9DB4C8",
  Incubators: "#A9B8C6",
  "Lighting kits": "#F2D06B",
  "Lighting fixtures": "#E9C46A",
  "UVB tubes": "#F4E285",
  "Dome & clamp fixtures": "#B9B2A6",
  "Heat & spot bulbs": "#F4A261",
  "Heat mats & cables": "#E76F51",
  "Electronics & heaters": "#8E9AAF",
  "Misting & water": "#5FA8D3",
  "Filters & media": "#62B6CB",
  "Water care": "#4EA8DE",
  Supplements: "#E9EDC9",
  "Diets & food": "#F6BD60",
  "Botanicals & leaf litter": "#A98467",
  "Mats & liners": "#84A59D",
  Substrate: "#8D6346",
  "Rocks & stone": "#9A8C98",
  "Wood & branches": "#A47148",
  "Waterfalls & features": "#7A9E9F",
  Plants: "#52B788",
  "Hides & decor": "#B08968",
  "Cups & husbandry tools": "#CED4DA",
  Books: "#E5989B",
  Merch: "#B5838D",
  "Bird & small pet": "#F7B267",
  "Shipping supplies": "#C8A27A",
  "General supplies": "#ADB5BD",
};

/** Shopify CDN thumbnails: small ones for the 3D textures and lists. */
export function cdnImage(url: string, width = 320) {
  if (!url.includes("cdn.shopify.com")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}width=${width}`;
}

export function productToItems(p: Product, qty: number, lineId: string): PackItem[] {
  return Array.from({ length: qty }, (_, i) => ({
    id: `${lineId}#${i + 1}`,
    sku: p.sku,
    productId: p.id,
    name: p.title,
    image: cdnImage(p.image, 256),
    dims: { l: p.length, w: p.width, h: p.height },
    weight: p.weight,
    handling: p.handling as Handling,
    fragile: p.fragile,
    keepUpright: p.keepUpright,
    maxLoad: p.maxLoad,
    shipsInOwnBox: p.shipsInOwnBox,
    color: CATEGORY_COLORS[p.category] ?? "#ADB5BD",
  }));
}

export function rowToContainer(c: Container): ContainerSpec {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind as ContainerSpec["kind"],
    inner: { l: c.innerL, w: c.innerW, h: c.innerH },
    outer: { l: c.outerL, w: c.outerW, h: c.outerH },
    tare: c.tare,
    maxGross: c.maxGross,
    costCents: c.costCents,
    insulated: c.insulated,
    accepts: c.accepts.split(",").filter(Boolean) as Handling[],
    stock: c.stock,
    coolant: c.coolant ?? undefined,
    deckHeight: c.deckHeight ?? undefined,
  };
}

export function containerToRow(c: ContainerSpec, sort: number) {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind,
    innerL: Math.round(c.inner.l),
    innerW: Math.round(c.inner.w),
    innerH: Math.round(c.inner.h),
    outerL: Math.round(c.outer.l),
    outerW: Math.round(c.outer.w),
    outerH: Math.round(c.outer.h),
    tare: c.tare,
    maxGross: c.maxGross,
    costCents: c.costCents,
    insulated: c.insulated,
    accepts: c.accepts.join(","),
    stock: c.stock,
    coolant: c.coolant ? Math.round(c.coolant) : null,
    deckHeight: c.deckHeight ? Math.round(c.deckHeight) : null,
    active: true,
    sort,
  };
}

export const SETTINGS_KEY = "pack-options";

export function parseOptions(value: string | undefined | null): PackOptions {
  if (!value) return DEFAULT_OPTIONS;
  try {
    return { ...DEFAULT_OPTIONS, ...(JSON.parse(value) as Partial<PackOptions>) };
  } catch {
    return DEFAULT_OPTIONS;
  }
}
