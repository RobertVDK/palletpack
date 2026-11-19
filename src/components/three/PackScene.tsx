"use client";

import { CameraControls, ContactShadows, Environment, Grid, Lightformer } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo } from "react";
import * as THREE from "three";
import { useApp } from "@/components/app-store";
import { findPackage, useStation, type ViewPreset } from "@/components/station/store";
import type { PackItem, PackPlan, Package, Placement } from "@/lib/packing/types";
import { weight as fmtWeight } from "@/lib/units";
import { SceneLabel } from "./scene-labels";
import { ClosedCarton, CogMarker, DimensionLines, Glide, ItemMesh, M, OpenCarton, PalletModel, StretchWrap, type V3 } from "./models";

// Engine space (x = length, y = width, z = up, mm) → three.js (x, y = up, z, metres).
function centreOf(p: Placement, origin: V3): V3 {
  return [origin[0] + M(p.x + p.dx / 2), origin[1] + M(p.z + p.dz / 2), origin[2] + M(p.y + p.dy / 2)];
}

function explode(c: V3, mid: V3, f: number, lift: number): V3 {
  return [mid[0] + (c[0] - mid[0]) * f, c[1] + (c[1] - mid[1]) * lift, mid[2] + (c[2] - mid[2]) * f];
}

/** Items inside one carton, in the carton's own frame (floor of carton at y = 0). */
function CartonContents({ pkg, items, visibleUpTo, exploded, ghostNext }: { pkg: Package; items: Record<string, PackItem>; visibleUpTo: number; exploded: boolean; ghostNext: boolean }) {
  const hover = useStation((s) => s.hover);
  const set = useStation((s) => s.set);
  const { inner, outer } = pkg.container;
  const origin: V3 = [-M(inner.l) / 2, Math.max(0.004, M((outer.h - inner.h) / 2)), -M(inner.w) / 2];
  const mid: V3 = [0, origin[1] + M(inner.h) / 2, 0];
  const next = pkg.placements[visibleUpTo];
  return (
    <group>
      {pkg.placements.map((p, i) => {
        if (i >= visibleUpTo) return null;
        const it = items[p.refId];
        if (!it) return null;
        const c = centreOf(p, origin);
        const target = exploded ? explode(c, mid, 1.55, 0.9) : c;
        return (
          <Glide key={p.refId} target={target} appearKey={p.refId}>
            <ItemMesh item={it} size={[M(p.dx), M(p.dz), M(p.dy)]} pad={p.pad} hovered={hover === it.id} onHover={(id, at) => set({ hover: id, hoverAt: at ?? null })} />
          </Glide>
        );
      })}
      {ghostNext && next && (
        // Where the next unit goes: a dashed yellow target for the packer.
        <mesh position={centreOf(next, origin)}>
          <boxGeometry args={[M(next.dx), M(next.dz), M(next.dy)]} />
          <meshBasicMaterial color="#ffc531" wireframe transparent opacity={0.55} />
        </mesh>
      )}
    </group>
  );
}

function BoxPackage({ pkg, plan, build, exploded, closed, solid, labeled, ghostNext }: { pkg: Package; plan: PackPlan; build: number; exploded: boolean; closed: boolean; solid: boolean; labeled: boolean; ghostNext: boolean }) {
  if (pkg.kind === "own") {
    const it = plan.items[pkg.itemIds[0]];
    return <ClosedCarton pkg={pkg} xray={false} labeled={labeled} photo={it?.image} />;
  }
  const coolant = pkg.container.coolant ? (pkg.handling === "frozen" ? "Gel packs" : "Heat pack") : undefined;
  return (
    <group>
      <OpenCarton pkg={pkg} closed={closed} solidWhenClosed={solid} labeled={labeled} coolantLabel={coolant} />
      {!(closed && solid) && <CartonContents pkg={pkg} items={plan.items} visibleUpTo={build} exploded={exploded} ghostNext={ghostNext} />}
    </group>
  );
}

function PalletPackage({ pkg, plan, build, xray, exploded, wrap, labeled, showCog }: { pkg: Package; plan: PackPlan; build: number; xray: boolean; exploded: boolean; wrap: boolean; labeled: boolean; showCog: boolean }) {
  const deck = M(pkg.container.deckHeight ?? 140);
  const origin: V3 = [-M(pkg.container.inner.l) / 2, deck, -M(pkg.container.inner.w) / 2];
  const byId = Object.fromEntries(pkg.children.map((c) => [c.id, c]));
  const loadTop = pkg.placements.reduce((m, p) => Math.max(m, p.z + p.dz), 0);
  const mid: V3 = [0, deck + M(loadTop) / 2, 0];
  const complete = build >= pkg.placements.length;
  const set = useStation((s) => s.set);
  return (
    <group>
      <PalletModel pallet={pkg.container} />
      {pkg.placements.map((p, i) => {
        if (i >= build) return null;
        const child = byId[p.refId];
        if (!child) return null;
        const c = centreOf(p, origin);
        const bottom: V3 = [c[0], c[1] - M(p.dz) / 2, c[2]];
        const target = exploded ? explode(bottom, [mid[0], deck, mid[2]], 1.35, 0) : bottom;
        const lifted: V3 = exploded ? [target[0], target[1] + (bottom[1] - deck) * 0.6, target[2]] : target;
        const rotated = p.orientation === 1;
        return (
          <Glide key={p.refId} target={lifted} appearKey={p.refId} drop={0.4}>
            <group
              rotation={[0, rotated ? Math.PI / 2 : 0, 0]}
              onPointerOver={(e) => {
                e.stopPropagation();
                if (!xray) set({ hover: child.id, hoverAt: { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY } });
              }}
              onPointerMove={(e) => {
                if (!xray) set({ hoverAt: { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY } });
              }}
              onPointerOut={() => set({ hover: null, hoverAt: null })}
            >
              <ClosedCarton pkg={child} xray={xray} labeled={labeled} photo={child.kind === "own" ? plan.items[child.itemIds[0]]?.image : undefined} />
              {xray && child.kind === "box" && <CartonContents pkg={child} items={plan.items} visibleUpTo={child.placements.length} exploded={false} ghostNext={false} />}
            </group>
          </Glide>
        );
      })}
      {complete && wrap && !exploded && !xray && pkg.placements.length > 0 && (
        <StretchWrap
          size={[M(pkg.container.inner.l) * 0.995, M(loadTop) + 0.01, M(pkg.container.inner.w) * 0.995]}
          center={[0, deck + (M(loadTop) + 0.01) / 2, 0]}
        />
      )}
      {showCog && complete && <CogMarker position={[origin[0] + M(pkg.cog.x), M(pkg.cog.z), origin[2] + M(pkg.cog.y)]} deckY={deck} />}
    </group>
  );
}

/** Lays every package out on the floor, left to right, with name tags. */
function Overview({ plan, labeled }: { plan: PackPlan; labeled: boolean }) {
  const units = useApp((s) => s.units);
  const set = useStation((s) => s.set);
  const gap = 0.22;
  const widths = plan.packages.map((p) => M(p.outer.l));
  const total = widths.reduce((s, w) => s + w, 0) + gap * (plan.packages.length - 1);
  const centres = widths.map((w, i) => -total / 2 + widths.slice(0, i).reduce((s, v) => s + v + gap, 0) + w / 2);
  return (
    <group>
      {plan.packages.map((p, i) => {
        const cx = centres[i];
        return (
          <group key={p.id} position={[cx, 0, 0]} onClick={(e) => (e.stopPropagation(), set({ selected: p.id, build: p.placements.length }))}>
            {p.kind === "pallet" ? (
              <PalletPackage pkg={p} plan={plan} build={p.placements.length} xray={false} exploded={false} wrap labeled={labeled} showCog={false} />
            ) : p.kind === "own" ? (
              <ClosedCarton pkg={p} xray={false} labeled={labeled} photo={plan.items[p.itemIds[0]]?.image} />
            ) : (
              <OpenCarton pkg={p} closed solidWhenClosed labeled={labeled} />
            )}
            <SceneLabel id={`tag:${p.id}`} text={p.id} sub={fmtWeight(p.grossWeight, units)} variant="tag" position={[0, M(p.outer.h) + 0.06, 0]} />
          </group>
        );
      })}
    </group>
  );
}

interface Controls {
  setLookAt: (px: number, py: number, pz: number, tx: number, ty: number, tz: number, transition: boolean) => Promise<void>;
}

const PRESETS: Record<ViewPreset, [number, number]> = {
  iso: [Math.PI / 4.2, Math.PI / 3.1],
  top: [0, 0.0001],
  front: [0, Math.PI / 2.05],
  side: [Math.PI / 2, Math.PI / 2.05],
};

/** Frames the subject's bounding sphere from the chosen angle (fitToBox would snap to a face). */
function CameraRig({ size, view, nonce, subject }: { size: V3; view: ViewPreset; nonce: number; subject: string }) {
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  useEffect(() => {
    if (!controls) return;
    const [az, polar] = PRESETS[view];
    const radius = 0.5 * Math.hypot(size[0], size[1], size[2]) + 0.04;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const dist = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 1.14;
    const target = new THREE.Vector3(0, size[1] * 0.42, 0);
    const pos = new THREE.Vector3().setFromSphericalCoords(dist, polar, az).add(target);
    controls.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, true);
  }, [controls, camera, aspect, size, view, nonce, subject]);
  return null;
}

function Floor({ zone }: { zone: V3 }) {
  const w = zone[0] + 0.5;
  const d = zone[2] + 0.5;
  const t = 0.05;
  const tape = (pos: V3, s: [number, number]) => (
    <mesh position={pos} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={s} />
      <meshStandardMaterial color="#ffc531" roughness={0.6} />
    </mesh>
  );
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.001, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#1f252d" roughness={1} />
      </mesh>
      <Grid
        position={[0, 0, 0]}
        args={[40, 40]}
        cellSize={0.1}
        cellThickness={0.6}
        cellColor="#28303a"
        sectionSize={0.5}
        sectionThickness={1}
        sectionColor="#343e4b"
        fadeDistance={9}
        fadeStrength={1.4}
        infiniteGrid
      />
      {/* Floor tape around the pack zone */}
      {tape([0, 0.0005, -d / 2], [w + t, t])}
      {tape([0, 0.0005, d / 2], [w + t, t])}
      {tape([-w / 2, 0.0005, 0], [t, d])}
      {tape([w / 2, 0.0005, 0], [t, d])}
    </group>
  );
}

export default function PackScene() {
  const units = useApp((s) => s.units);
  const { detail, selected, build, xray, exploded, showDims, wrap, step, view, viewNonce, set } = useStation();
  const plan = detail?.shipment?.plan;
  const labeled = step === "ship";
  const pkg = selected !== "all" ? findPackage(plan, selected) : undefined;

  const subjectSize = useMemo<V3>(() => {
    if (!plan || !plan.packages.length) return [0.6, 0.3, 0.4];
    // Open flaps stand about half the box width above the rim.
    if (pkg) return [M(pkg.outer.l), M(pkg.outer.h) + (pkg.kind === "box" ? M(pkg.outer.w) * 0.45 : 0), M(pkg.outer.w)];
    const gap = 0.22;
    const w = plan.packages.reduce((s, p) => s + M(p.outer.l), 0) + gap * (plan.packages.length - 1);
    return [w, Math.max(...plan.packages.map((p) => M(p.outer.h))), Math.max(...plan.packages.map((p) => M(p.outer.w)))];
  }, [plan, pkg]);

  const complete = pkg ? build >= pkg.placements.length : true;
  const closed = !!pkg && pkg.kind === "box" && complete && !exploded && (step !== "pack" || build > 0);
  const solid = step !== "pack";

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [1.4, 1.1, 1.6], fov: 36, near: 0.01, far: 80 }}
      gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onPointerMissed={() => set({ hover: null, hoverAt: null })}
    >
      <color attach="background" args={["#181d24"]} />
      <fog attach="fog" args={["#181d24", 5, 14]} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={["#e3ebf5", "#1b2027", 0.55]} />
      <directionalLight
        position={[2.5, 4.5, 2.2]}
        intensity={1.7}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0004}
      />
      <directionalLight position={[-3, 2, -2]} intensity={0.35} color="#b9c8ff" />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={1.6} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} />
        <Lightformer form="rect" intensity={0.9} position={[-5, 2, 1]} rotation-y={Math.PI / 2} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={0.6} color="#ffd98a" position={[5, 1.5, -1]} rotation-y={-Math.PI / 2} scale={[6, 2, 1]} />
      </Environment>

      <Floor zone={subjectSize} />

      <Suspense fallback={null}>
        {plan && !pkg && <Overview plan={plan} labeled={labeled} />}
        {plan && pkg && pkg.kind !== "pallet" && (
          <BoxPackage pkg={pkg} plan={plan} build={build} exploded={exploded} closed={closed} solid={solid} labeled={labeled} ghostNext={step === "pack" && !complete} />
        )}
        {plan && pkg && pkg.kind === "pallet" && (
          <PalletPackage pkg={pkg} plan={plan} build={build} xray={xray} exploded={exploded} wrap={wrap} labeled={labeled} showCog={step === "pack" || step === "verify"} />
        )}
        {pkg && <DimensionLines size={pkg.outer} units={units} show={showDims && complete && !exploded} />}
      </Suspense>

      <ContactShadows position={[0, 0.0008, 0]} opacity={0.55} scale={Math.max(6, subjectSize[0] * 2.5)} blur={2.4} far={2.5} />
      <CameraControls makeDefault minDistance={0.25} maxDistance={12} maxPolarAngle={Math.PI / 2.02} />
      <CameraRig size={subjectSize} view={view} nonce={viewNonce} subject={`${detail?.order.id}:${selected}:${plan?.mode}`} />
    </Canvas>
  );
}
