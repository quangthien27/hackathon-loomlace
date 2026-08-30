"use client";

/* eslint-disable react-hooks/immutability -- see below */
/**
 * FRICTION WORTH RECORDING: the React Compiler lint rules and R3F disagree here.
 *
 * `useFrame` runs sixty times a second and its entire job is to mutate things
 * that live outside React — camera position, a quaternion, a DOM node's text.
 * `react-hooks/immutability` treats that callback as render-phase code and
 * rejects all of it. There is no rewrite that satisfies both: the mutation IS
 * the API. Every other file in this project passes the rule untouched, so this
 * is a cost of the 3D renderer specifically, not of the codebase.
 */

import { ContactShadows, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Group, NeutralToneMapping, PerspectiveCamera, type Texture, Vector3 } from "three";
import type { DesignState } from "@/lib/design";
import { bandDims, VIEWS } from "@/lib/render3d/scene";
import { buildBackdropTexture, buildGemEnvironment, buildStudioEnvironment } from "@/lib/render3d/studio";
import { Ring3D, type GemMode } from "./Ring3D";

const TMP = new Vector3();

/**
 * Only the parts of OrbitControls the rig touches. Typed structurally rather
 * than imported, because the concrete class lives in three's addons or in
 * three-stdlib depending on who pulled it in, and this needs neither.
 */
type Orbit = { enabled: boolean; target: Vector3; update: () => void };

/**
 * Moves the camera and turns the ring when `view` changes, then gets out of the
 * way so the human can orbit. `set_view` is a read-only tool, so this is the
 * cheapest possible call producing the biggest visual payoff — in 3D it buys a
 * camera move rather than a redrawn picture.
 */
function ViewRig({ view, ring }: { view: DesignState["view"]; ring: React.RefObject<Group | null> }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as Orbit | null;
  const flying = useRef(true);
  const previous = useRef(view);

  useEffect(() => {
    if (previous.current !== view) {
      previous.current = view;
      flying.current = true;
    }
  }, [view]);

  useFrame((_, dt) => {
    const cfg = VIEWS[view];

    // The ring turns whether or not the camera is flying, so a design change
    // mid-flight does not snap it.
    ring.current?.quaternion.slerp(cfg.quaternion, 1 - Math.exp(-dt * 6));

    if (!flying.current) return;

    const k = 1 - Math.exp(-dt * 4.2);
    camera.position.lerp(TMP.set(...cfg.camera), k);
    if (Math.abs(camera.fov - cfg.fov) > 0.01) {
      camera.fov += (cfg.fov - camera.fov) * k;
      camera.updateProjectionMatrix();
    }

    if (controls) {
      controls.enabled = false;
      controls.target.lerp(TMP.set(...cfg.target), k);
      controls.update();
    } else {
      camera.lookAt(TMP.set(...cfg.target));
    }

    if (camera.position.distanceTo(TMP.set(...cfg.camera)) < 0.15) {
      flying.current = false;
      if (controls) controls.enabled = true;
    }
  });

  return null;
}

/**
 * Frame time, written straight to the DOM rather than through state.
 *
 * This number is a decision input, not decoration: transmission costs a full
 * scene re-render per refractive material, so "does this hold 60fps with a halo
 * on" is the question that decides whether 3D is viable on a judge's phone.
 */
function FrameMeter({ node }: { node: React.RefObject<HTMLSpanElement | null> }) {
  const acc = useRef({ frames: 0, elapsed: 0 });
  useFrame((_, dt) => {
    const a = acc.current;
    a.frames += 1;
    a.elapsed += dt;
    if (a.elapsed >= 0.5 && node.current) {
      node.current.textContent = `${Math.round(a.frames / a.elapsed)} fps`;
      a.frames = 0;
      a.elapsed = 0;
    }
  });
  return null;
}

/**
 * Publishes renderer state for measurement. Draw calls and triangle count are
 * the numbers that decide whether this route survives on a phone, and guessing
 * at them is exactly how a 3D rewrite gets committed to on vibes.
 */
function Diagnostics() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const last = useRef(0);
  useFrame(() => {
    const now = performance.now();
    if (now - last.current < 400) return;
    last.current = now;
    // A dataset entry rather than a window global: extension tooling reads the
    // DOM, and a page-world global is not visible from an isolated world.
    document.documentElement.dataset.loomlace3d = JSON.stringify({
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      programs: gl.info.programs?.length ?? 0,
      camera: camera.position.toArray().map((n) => +n.toFixed(1)),
      fov: +camera.fov.toFixed(1),
    });
  });
  return null;
}

/**
 * Keeps the loop turning while the tab is hidden — DEV ONLY.
 *
 * Chrome pauses requestAnimationFrame in a background tab, so the canvas holds
 * a stale frame and any automated screenshot catches whatever was last drawn.
 * That makes the renderer effectively untestable from outside the browser. A
 * timer is not throttled the same way, so this drives one frame at a time.
 * Never enabled in production: a hidden tab should not be burning GPU.
 */
function HiddenTabTick() {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    // Must go through `advance`, not `gl.render`: rendering directly paints the
    // scene but never runs the useFrame callbacks, so the camera rig and the
    // ring's orientation freeze and every view but the first looks wrong.
    const id = setInterval(() => {
      if (document.hidden) advance(performance.now());
    }, 120);
    return () => clearInterval(id);
  }, [advance]);
  return null;
}

/** See buildBackdropTexture: without something behind it, a transmissive gem is black. */
function Backdrop() {
  const map = useMemo(() => buildBackdropTexture(), []);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh position={[0, 2, -46]}>
      <planeGeometry args={[190, 150]} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  );
}

export function RingScene3D({
  design,
  mode,
  fpsRef,
}: {
  design: DesignState;
  mode: GemMode;
  fpsRef: React.RefObject<HTMLSpanElement | null>;
}) {
  const ring = useRef<Group>(null);
  // Built inside onCreated because it needs the renderer; held in state so the
  // gem materials pick it up on the next render.
  const [gemEnv, setGemEnv] = useState<Texture | null>(null);
  // Every view stands the ring on edge (see VIEWS), so the surface it casts
  // onto is always just under the band's lowest point.
  const floorY = -bandDims(design).outerR - 0.05;

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: VIEWS.top.camera, fov: VIEWS.top.fov, near: 0.1, far: 400 }}
      onCreated={({ gl, scene }) => {
        // ACESFilmic (R3F's default) rolls off exactly the saturated speculars
        // that make a gem read as a gem. Khronos PBR Neutral keeps them.
        gl.toneMapping = NeutralToneMapping;
        gl.toneMappingExposure = 1.15;
        scene.environment = buildStudioEnvironment(gl);
        scene.environmentIntensity = 1.35;
        setGemEnv(buildGemEnvironment(gl));
      }}
    >
      <Backdrop />

      <group ref={ring}>
        <Ring3D design={design} mode={mode} gemEnv={gemEnv} />
      </group>

      {design.view !== "inside" && (
        <ContactShadows
          position={[0, floorY, 0]}
          opacity={0.42}
          scale={70}
          blur={2.6}
          far={26}
          resolution={512}
          color="#2b2118"
        />
      )}

      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={22}
        maxDistance={120}
        enableDamping
        dampingFactor={0.09}
        target={VIEWS.top.target}
      />
      <ViewRig view={design.view} ring={ring} />
      <FrameMeter node={fpsRef} />
      <Diagnostics />
      <HiddenTabTick />
    </Canvas>
  );
}
