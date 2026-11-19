// Engine coordinates: x runs along a container's length, y along its width, z is up.
// All lengths are millimetres, all weights grams, all money integer cents (CAD).

export type Handling = "standard" | "live" | "frozen";

export interface Dims {
  l: number;
  w: number;
  h: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** One physical unit to pack (an order line with qty 3 becomes three PackItems). */
export interface PackItem {
  id: string;
  sku: string;
  productId: string;
  name: string;
  image?: string;
  dims: Dims;
  weight: number;
  handling: Handling;
  fragile: boolean;
  keepUpright: boolean;
  /** Grams this unit can carry on its top face. Infinity when it is a sturdy carton. */
  maxLoad: number;
  /** Ships in its own retail carton (terrariums, racks) – never over-boxed. */
  shipsInOwnBox: boolean;
  color: string;
}

export interface ContainerSpec {
  id: string;
  name: string;
  kind: "box" | "pallet";
  inner: Dims;
  outer: Dims;
  tare: number;
  /** Maximum gross weight (contents + tare). */
  maxGross: number;
  costCents: number;
  insulated: boolean;
  /** Handling types this container accepts. */
  accepts: Handling[];
  stock: number;
  /** Pallets only: deck height under the load. */
  deckHeight?: number;
  /** Insulated boxes: space kept free at the top for a heat or gel pack (mm). */
  coolant?: number;
}

export interface Placement {
  refId: string;
  refKind: "item" | "package";
  /** Position of the occupied envelope (includes wrap padding). */
  x: number;
  y: number;
  z: number;
  /** Occupied envelope after rotation. */
  dx: number;
  dy: number;
  dz: number;
  orientation: number;
  /** Protective wrap on each side, inside the envelope. */
  pad: number;
  supportRatio: number;
  step: number;
}

export interface Package {
  id: string;
  kind: "box" | "own" | "pallet";
  handling: Handling;
  container: ContainerSpec;
  placements: Placement[];
  /** PackItems in this package (for pallets: every item across child cartons). */
  itemIds: string[];
  /** Pallets only: the cartons sitting on the deck. */
  children: Package[];
  outer: Dims;
  contentsWeight: number;
  dunnageWeight: number;
  grossWeight: number;
  /** Item volume / usable container volume. */
  fill: number;
  cog: Vec3;
  flags: PackageFlag[];
}

export type PackageFlag =
  | "fragile"
  | "keep-upright"
  | "live"
  | "frozen"
  | "oversize"
  | "heavy"
  | "no-fit"
  | "off-center";

export interface PlanNote {
  level: "info" | "warn" | "rule";
  text: string;
}

export type PlanMode = "boxes" | "skid";

export interface PackPlan {
  mode: PlanMode;
  packages: Package[];
  items: Record<string, PackItem>;
  notes: PlanNote[];
  metrics: PlanMetrics;
}

export interface PlanMetrics {
  units: number;
  parcels: number;
  pallets: number;
  grossWeight: number;
  shippedVolume: number;
  itemVolume: number;
  avgFill: number;
  boxCostCents: number;
  estShipCents: number;
  candidatesTried: number;
  computeMs: number;
}

export interface PackOptions {
  /** Wrap allowance per side for fragile units (mm). */
  fragilePad: number;
  /** Minimum share of an item's base that must rest on something. */
  minSupportBox: number;
  minSupportPallet: number;
  /** Pallet build height limit including the deck (mm). */
  palletMaxHeight: number;
  /** Max gross per parcel accepted by couriers (g). */
  parcelMaxGross: number;
}

export const DEFAULT_OPTIONS: PackOptions = {
  fragilePad: 19, // ¾" bubble
  minSupportBox: 0.6,
  minSupportPallet: 0.75,
  palletMaxHeight: 1829, // 72"
  parcelMaxGross: 31_750, // 70 lb
};
