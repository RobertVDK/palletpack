"use client";

import { Edges, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Dims, PackItem, Package } from "@/lib/packing/types";
import { len, lenUnit, type Units } from "@/lib/units";
import { SceneLabel } from "./scene-labels";
import { labelTexture, useProductTexture } from "./textures";

export const M = (mm: number) => mm / 1000;
const damp = THREE.MathUtils.damp;

export const KRAFT = "#c8a27a";
const KRAFT_EDGE = "#7d5f3f";
const TAPE = "#d8b77e";
const EPS = "#eceee8";

export type V3 = [number, number, number];

/** Smoothly glides its children to `target`; on (re)appearance it drops in from above. */
export function Glide({ target, drop = 0.28, appearKey, children }: { target: V3; drop?: number; appearKey?: string | number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.position.set(target[0], target[1] + drop, target[2]);
    g.scale.setScalar(drop > 0 ? 0.94 : 1);
    // Only on appearance; later target changes glide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearKey]);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const k = 9;
    g.position.x = damp(g.position.x, target[0], k, dt);
    g.position.y = damp(g.position.y, target[1], k, dt);
    g.position.z = damp(g.position.z, target[2], k, dt);
    const s = damp(g.scale.x, 1, k, dt);
    g.scale.setScalar(s);
  });
  return <group ref={ref}>{children}</group>;
}

// ───────────────────────── items ─────────────────────────

interface ItemProps {
  item: PackItem;
  size: V3;
  pad: number;
  hovered: boolean;
  dimmed?: boolean;
  onHover?: (id: string | null, at?: { x: number; y: number }) => void;
}

export function ItemMesh({ item, size, pad, hovered, dimmed, onHover }: ItemProps) {
  const tex = useProductTexture(item.image);
  const p = M(pad);
  const inner: V3 = [Math.max(0.004, size[0] - 2 * p), Math.max(0.004, size[1] - 2 * p), Math.max(0.004, size[2] - 2 * p)];
  const cup = item.handling === "live";
  const opacity = dimmed ? 0.25 : 1;

  return (
    <group
      onPointerOver={(e) => {
        e.stopPropagation();
        onHover?.(item.id, { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
      }}
      onPointerMove={(e) => {
        e.stopPropagation();
        onHover?.(item.id, { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
      }}
      onPointerOut={() => onHover?.(null)}
    >
      {cup ? (
        <group>
          {/* Vented deli cup: clear plastic with the animal/feeder photo wrapped inside. */}
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[Math.min(inner[0], inner[2]) / 2, Math.min(inner[0], inner[2]) / 2.25, inner[1], 32]} />
            <meshPhysicalMaterial color="#e8f4ee" transparent opacity={0.45 * opacity} roughness={0.12} clearcoat={1} depthWrite={false} />
          </mesh>
          <mesh>
            <cylinderGeometry args={[Math.min(inner[0], inner[2]) / 2.25, Math.min(inner[0], inner[2]) / 2.5, inner[1] * 0.8, 32]} />
            <meshStandardMaterial map={tex} color={tex ? "#ffffff" : item.color} roughness={0.6} transparent={!!dimmed} opacity={opacity} />
          </mesh>
          <mesh position={[0, inner[1] / 2 + 0.002, 0]}>
            <cylinderGeometry args={[Math.min(inner[0], inner[2]) / 1.95, Math.min(inner[0], inner[2]) / 1.95, 0.004, 32]} />
            <meshStandardMaterial color="#f7f7f2" roughness={0.4} transparent={!!dimmed} opacity={opacity} />
          </mesh>
        </group>
      ) : (
        <mesh castShadow receiveShadow>
          <boxGeometry args={inner} />
          <meshStandardMaterial key={dimmed ? "dim" : "solid"} map={tex} color={tex ? "#ffffff" : item.color} roughness={0.58} transparent={!!dimmed} opacity={opacity} />
          <Edges color={hovered ? "#ffc531" : "#1b1f25"} lineWidth={hovered ? 2.5 : 1} threshold={20} />
        </mesh>
      )}
      {pad > 0 && (
        // Bubble wrap around fragile units.
        <mesh>
          <boxGeometry args={size} />
          <meshPhysicalMaterial color="#eaf4ff" transparent opacity={0.2 * opacity} roughness={0.1} clearcoat={0.6} depthWrite={false} />
          <Edges color="#cfe3f7" threshold={20} />
        </mesh>
      )}
    </group>
  );
}

// ───────────────────────── cartons ─────────────────────────

function Flap({ hinge, axis, sign, size, offset, open, opacity, color }: { hinge: V3; axis: "x" | "z"; sign: 1 | -1; size: V3; offset: V3; open: boolean; opacity: number; color: string }) {
  const ref = useRef<THREE.Group>(null);
  const target = open ? sign * (Math.PI / 2 + 0.38) : 0;
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    g.rotation[axis] = damp(g.rotation[axis], target, 5, dt);
  });
  return (
    <group ref={ref} position={hinge}>
      <mesh position={offset} castShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.9} transparent opacity={opacity} depthWrite={opacity > 0.9} side={THREE.DoubleSide} />
        <Edges color={KRAFT_EDGE} threshold={20} />
      </mesh>
    </group>
  );
}

/** Open-top regular slotted carton seen from the packer's side; flaps close when the build completes. */
export function OpenCarton({
  pkg,
  closed,
  solidWhenClosed,
  labeled,
  coolantLabel,
}: {
  pkg: Package;
  closed: boolean;
  solidWhenClosed: boolean;
  labeled: boolean;
  coolantLabel?: string;
}) {
  const { outer, inner } = pkg.container;
  const L = M(outer.l);
  const W = M(outer.w);
  const H = M(outer.h);
  const t = Math.max(0.004, M((outer.l - inner.l) / 2));
  const tb = Math.max(0.004, M((outer.h - inner.h) / 2));
  const insulated = pkg.container.insulated;
  const wallColor = insulated ? EPS : KRAFT;
  const wallOpacity = closed && solidWhenClosed ? 1 : 0.2;
  const flapOpacity = closed ? (solidWhenClosed ? 1 : 0.55) : 0.9;
  const walls: { pos: V3; size: V3 }[] = [
    { pos: [0, H / 2, -W / 2 + t / 2], size: [L, H, t] },
    { pos: [0, H / 2, W / 2 - t / 2], size: [L, H, t] },
    { pos: [-L / 2 + t / 2, H / 2, 0], size: [t, H, W - 2 * t] },
    { pos: [L / 2 - t / 2, H / 2, 0], size: [t, H, W - 2 * t] },
  ];
  const ft = 0.003;
  const coolant = pkg.container.coolant ? M(pkg.container.coolant) : 0;

  return (
    <group>
      <mesh position={[0, tb / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[L, tb, W]} />
        <meshStandardMaterial color={wallColor} roughness={0.92} />
      </mesh>
      {walls.map((w, i) => (
        <mesh key={i} position={w.pos} castShadow={wallOpacity > 0.9}>
          <boxGeometry args={w.size} />
          <meshStandardMaterial color={wallColor} roughness={0.92} transparent opacity={wallOpacity} depthWrite={wallOpacity > 0.9} />
          <Edges color={insulated ? "#9aa29a" : KRAFT_EDGE} threshold={20} />
        </mesh>
      ))}
      {insulated && (
        // Kraft outer sleeve around the EPS liner.
        <mesh position={[0, H / 2, 0]}>
          <boxGeometry args={[L + 0.004, H, W + 0.004]} />
          <meshStandardMaterial color={KRAFT} transparent opacity={closed && solidWhenClosed ? 1 : 0.12} depthWrite={false} roughness={0.9} />
          <Edges color={KRAFT_EDGE} threshold={20} />
        </mesh>
      )}
      {coolant > 0 && (
        <group position={[0, H - tb - coolant / 2, 0]}>
          <mesh>
            <boxGeometry args={[M(inner.l) * 0.62, coolant * 0.7, M(inner.w) * 0.62]} />
            <meshStandardMaterial color={pkg.handling === "frozen" ? "#74c7ff" : "#ff8a3d"} roughness={0.35} transparent opacity={0.9} />
          </mesh>
          {coolantLabel && <SceneLabel id={`coolant:${pkg.id}`} text={coolantLabel} variant="coolant" align="right" position={[M(inner.l) * 0.31, 0, 0]} show={!closed} />}
        </group>
      )}
      {/* Long flaps hinge on the back/front walls, short flaps on the ends. */}
      <Flap hinge={[0, H, -W / 2]} axis="x" sign={-1} size={[L, ft, W / 2]} offset={[0, 0, W / 4]} open={!closed} opacity={flapOpacity} color={KRAFT} />
      <Flap hinge={[0, H, W / 2]} axis="x" sign={1} size={[L, ft, W / 2]} offset={[0, 0, -W / 4]} open={!closed} opacity={flapOpacity} color={KRAFT} />
      <Flap hinge={[-L / 2, H - ft, 0]} axis="z" sign={1} size={[Math.min(W / 2, L / 2), ft, W - 0.004]} offset={[Math.min(W / 2, L / 2) / 2, 0, 0]} open={!closed} opacity={flapOpacity} color={KRAFT} />
      <Flap hinge={[L / 2, H - ft, 0]} axis="z" sign={-1} size={[Math.min(W / 2, L / 2), ft, W - 0.004]} offset={[-Math.min(W / 2, L / 2) / 2, 0, 0]} open={!closed} opacity={flapOpacity} color={KRAFT} />
      {closed && <Tape L={L} W={W} H={H} />}
      {closed && labeled && <LabelSticker L={L} W={W} H={H} />}
    </group>
  );
}

function Tape({ L, W, H }: { L: number; W: number; H: number }) {
  return (
    <group>
      <mesh position={[0, H + 0.0035, 0]}>
        <boxGeometry args={[L + 0.002, 0.0012, Math.min(0.048, W * 0.3)]} />
        <meshStandardMaterial color={TAPE} roughness={0.25} metalness={0.05} transparent opacity={0.92} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (L / 2 + 0.0012), H - 0.03, 0]}>
          <boxGeometry args={[0.0012, 0.06, Math.min(0.048, W * 0.3)]} />
          <meshStandardMaterial color={TAPE} roughness={0.25} transparent opacity={0.92} />
        </mesh>
      ))}
    </group>
  );
}

function LabelSticker({ L, W, H }: { L: number; W: number; H: number }) {
  const tex = useMemo(() => labelTexture(), []);
  const w = Math.min(0.1, L * 0.45);
  const h = w * 0.62;
  return (
    <mesh position={[L / 2 - w / 2 - 0.015, H + 0.0045, W / 2 - h / 2 - 0.015]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} roughness={0.5} />
    </mesh>
  );
}

/** Taped carton as it sits on a skid or in the overview; see-through in x-ray mode. */
export function ClosedCarton({ pkg, xray, labeled, photo }: { pkg: Package; xray: boolean; labeled: boolean; photo?: string }) {
  const tex = useProductTexture(photo);
  const L = M(pkg.outer.l);
  const W = M(pkg.outer.w);
  const H = M(pkg.outer.h);
  const insulated = pkg.container.insulated;
  return (
    <group>
      <mesh position={[0, H / 2, 0]} castShadow={!xray} receiveShadow>
        <boxGeometry args={[L, H, W]} />
        <meshStandardMaterial
          key={xray ? "xray" : "solid"}
          color={photo && tex ? "#f1e3cf" : insulated ? "#d9c7ae" : KRAFT}
          map={photo ? tex : null}
          roughness={0.88}
          transparent={xray}
          opacity={xray ? 0.13 : 1}
          depthWrite={!xray}
        />
        <Edges color={xray ? "#c8a27a" : KRAFT_EDGE} threshold={20} />
      </mesh>
      {!xray && !photo && <Tape L={L} W={W} H={H} />}
      {!xray && labeled && <LabelSticker L={L} W={W} H={H} />}
    </group>
  );
}

// ───────────────────────── skid ─────────────────────────

export function PalletModel({ pallet }: { pallet: Package["container"] }) {
  const L = M(pallet.outer.l);
  const W = M(pallet.outer.w);
  const deck = M(pallet.deckHeight ?? 140);
  const board = deck * 0.15;
  const stringerH = deck - board * 2;
  const tones = ["#d9b98a", "#cfae7d", "#e0c296", "#d4b383", "#c9a675", "#dcbd8f", "#d2b080"];
  const top = 7;
  const bottom = 5;
  const bw = 0.089; // 3.5" boards
  return (
    <group>
      {[-1, 0, 1].map((s, i) => (
        <mesh key={`s${i}`} position={[0, board + stringerH / 2, s * (W / 2 - 0.02)]} castShadow receiveShadow>
          <boxGeometry args={[L, stringerH, 0.038]} />
          <meshStandardMaterial color="#b8956a" roughness={0.95} />
        </mesh>
      ))}
      {Array.from({ length: top }, (_, i) => (
        <mesh key={`t${i}`} position={[-L / 2 + bw / 2 + (i * (L - bw)) / (top - 1), deck - board / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[bw, board, W]} />
          <meshStandardMaterial color={tones[i % tones.length]} roughness={0.95} />
        </mesh>
      ))}
      {Array.from({ length: bottom }, (_, i) => (
        <mesh key={`b${i}`} position={[-L / 2 + bw / 2 + (i * (L - bw)) / (bottom - 1), board / 2, 0]} receiveShadow>
          <boxGeometry args={[bw, board, W]} />
          <meshStandardMaterial color={tones[(i + 3) % tones.length]} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

export function StretchWrap({ size, center }: { size: V3; center: V3 }) {
  const ref = useRef<THREE.MeshPhysicalMaterial>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.opacity = damp(ref.current.opacity, 0.16, 3, dt);
  });
  const bands = 6;
  return (
    <group position={center}>
      <mesh>
        <boxGeometry args={size} />
        <meshPhysicalMaterial ref={ref} color="#e4eef8" transparent opacity={0} roughness={0.08} clearcoat={1} depthWrite={false} />
      </mesh>
      {Array.from({ length: bands }, (_, i) => {
        const y = -size[1] / 2 + ((i + 0.5) * size[1]) / bands;
        const [x, , z] = size.map((v) => v / 2 + 0.0015) as V3;
        return (
          <Line
            key={i}
            points={[
              [-x, y, -z],
              [x, y, -z],
              [x, y, z],
              [-x, y, z],
              [-x, y, -z],
            ]}
            color="#cfe0f0"
            transparent
            opacity={0.35}
            lineWidth={1}
          />
        );
      })}
    </group>
  );
}

export function CogMarker({ position, deckY }: { position: V3; deckY: number }) {
  return (
    <group>
      <mesh position={position}>
        <sphereGeometry args={[0.018, 20, 20]} />
        <meshStandardMaterial color="#ffc531" emissive="#ffc531" emissiveIntensity={0.6} />
      </mesh>
      <Line points={[position, [position[0], deckY, position[2]]]} color="#ffc531" lineWidth={1.2} dashed dashSize={0.02} gapSize={0.015} />
      <Line points={[[-0.06, deckY + 0.002, 0], [0.06, deckY + 0.002, 0]]} color="#8a96a8" lineWidth={1} />
      <Line points={[[0, deckY + 0.002, -0.06], [0, deckY + 0.002, 0.06]]} color="#8a96a8" lineWidth={1} />
      <SceneLabel id="cg" text="CG" variant="cg" align="right" position={[position[0] + 0.03, position[1], position[2]]} />
    </group>
  );
}

// ───────────────────────── dimension callouts ─────────────────────────

function Tick({ a, b, color }: { a: V3; b: V3; color: string }) {
  return <Line points={[a, b]} color={color} lineWidth={1.4} />;
}

export function DimensionLines({ size, units, base = 0, show = true }: { size: Dims; units: Units; base?: number; show?: boolean }) {
  const L = M(size.l);
  const W = M(size.w);
  const H = M(size.h);
  const o = 0.05;
  const c = "#ffc531";
  const tk = 0.018;
  const label = (v: number) => `${len(v, units, 1)} ${lenUnit(units)}`;
  return (
    <group position={[0, base, 0]} visible={show}>
      {/* Length along the front edge */}
      <Line points={[[-L / 2, 0.001, W / 2 + o], [L / 2, 0.001, W / 2 + o]]} color={c} lineWidth={1.6} />
      <Tick a={[-L / 2, 0.001, W / 2 + o - tk]} b={[-L / 2, 0.001, W / 2 + o + tk]} color={c} />
      <Tick a={[L / 2, 0.001, W / 2 + o - tk]} b={[L / 2, 0.001, W / 2 + o + tk]} color={c} />
      <SceneLabel id="dim:l" text={`L ${label(size.l)}`} variant="dim" position={[0, 0.001, W / 2 + o + 0.03]} show={show} />
      {/* Width along the right edge */}
      <Line points={[[L / 2 + o, 0.001, -W / 2], [L / 2 + o, 0.001, W / 2]]} color={c} lineWidth={1.6} />
      <Tick a={[L / 2 + o - tk, 0.001, -W / 2]} b={[L / 2 + o + tk, 0.001, -W / 2]} color={c} />
      <Tick a={[L / 2 + o - tk, 0.001, W / 2]} b={[L / 2 + o + tk, 0.001, W / 2]} color={c} />
      <SceneLabel id="dim:w" text={`W ${label(size.w)}`} variant="dim" position={[L / 2 + o + 0.04, 0.001, 0]} show={show} />
      {/* Height up the front-right corner */}
      <Line points={[[L / 2 + o, 0, W / 2 + o], [L / 2 + o, H, W / 2 + o]]} color={c} lineWidth={1.6} />
      <Tick a={[L / 2 + o - tk, H, W / 2 + o]} b={[L / 2 + o + tk, H, W / 2 + o]} color={c} />
      <SceneLabel id="dim:h" text={`H ${label(size.h)}`} variant="dim" align="right" position={[L / 2 + o + 0.02, H / 2, W / 2 + o]} show={show} />
    </group>
  );
}
