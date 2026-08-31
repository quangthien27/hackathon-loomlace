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

import { OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BackSide,
  Group,
  NeutralToneMapping,
  PerspectiveCamera,
  SRGBColorSpace,
  type Texture,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from "three";
import type { DesignState } from "@/lib/design";
import { registerStudioCapture } from "@/lib/capture";
import { VIEWS, viewFor } from "@/lib/render3d/scene";
import {
  buildBackdropTexture,
  buildGemEnvironment,
  buildStudioEnvironment,
  type BackdropTone,
} from "@/lib/render3d/studio";
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
function ViewRig({ design, ring }: { design: DesignState; ring: React.RefObject<Group | null> }) {
  const view = design.view;
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const controls = useThree((s) => s.controls) as Orbit | null;
  const flying = useRef(true);
  // Ring size is part of this key, not just the view: it moves the aim point,
  // and the rig only steers while it is flying. Without it, resizing re-cut the
  // geometry under a camera that stayed pointed where the old ring used to be.
  const shot = `${view}:${design.sizeUk}`;
  const previous = useRef(shot);

  useEffect(() => {
    if (previous.current !== shot) {
      previous.current = shot;
      flying.current = true;
    }
  }, [shot]);

  useFrame((_, dt) => {
    // Solved every frame against the current design, not looked up once: ring
    // size moves the aim point, so a size change has to re-frame the shot.
    const cfg = viewFor(design);

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
function Backdrop({ tone }: { tone: BackdropTone }) {
  const map = useMemo(() => buildBackdropTexture(tone), [tone]);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh scale={[-1, 1, 1]}>
      {/* Big enough to sit well outside the orbit limits, so it never clips. */}
      <sphereGeometry args={[260, 48, 32]} />
      <meshBasicMaterial map={map} side={BackSide} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/**
 * Publishes a way to photograph the studio.
 *
 * Reads back an OFFSCREEN render rather than the canvas itself. Two earlier
 * attempts failed for reasons worth recording: `toDataURL` on the live canvas
 * returns a blank frame because the drawing buffer is cleared the moment the
 * browser composites, and `preserveDrawingBuffer` cannot be switched on through
 * R3F's `gl` prop — it is a context-CREATION attribute, and a props object is
 * applied to the renderer after the context already exists. Confirmed by
 * reading getContextAttributes() back, rather than assumed.
 *
 * Rendering into a target we own sidesteps both: the pixels are still there
 * when we ask for them, and nothing about the page's canvas has to change.
 */
function StudioCapture() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(
    () =>
      registerStudioCapture((options) => {
        const size = gl.getSize(new Vector2());
        const w = Math.floor(size.x);
        const h = Math.floor(size.y);
        // A canvas that has not been laid out yet reports three's 300x150
        // default. Refusing to shoot it is what stops the order page showing a
        // thumbnail-sized smear instead of falling back to the drawing.
        if (w < 240 || h < 240) return null;

        const target = new WebGLRenderTarget(w, h, { colorSpace: SRGBColorSpace });
        const previous = gl.getRenderTarget();
        // The effect composer switches the renderer's own tone mapping off and
        // does it in its final pass instead. This render bypasses the composer,
        // so it has to put the tone mapping back or the photograph comes out in
        // raw linear light — washed out, and nothing like the studio the
        // customer was just looking at.
        const previousToneMapping = gl.toneMapping;
        gl.toneMapping = NeutralToneMapping;
        gl.setRenderTarget(target);
        gl.render(scene, camera);
        gl.toneMapping = previousToneMapping;

        const pixels = new Uint8Array(w * h * 4);
        gl.readRenderTargetPixels(target, 0, 0, w, h, pixels);
        gl.setRenderTarget(previous);
        target.dispose();

        const out = document.createElement("canvas");
        out.width = w;
        out.height = h;
        const ctx = out.getContext("2d");
        if (!ctx) return null;

        // GL reads bottom-up; a canvas is top-down, so copy row by row in reverse.
        const image = ctx.createImageData(w, h);
        const stride = w * 4;
        for (let y = 0; y < h; y++) {
          const from = (h - 1 - y) * stride;
          image.data.set(pixels.subarray(from, from + stride), y * stride);
        }
        ctx.putImageData(image, 0, 0);

        const quality = options?.quality ?? 0.88;
        const maxPx = options?.maxPx;
        if (!maxPx || Math.max(w, h) <= maxPx) return out.toDataURL("image/jpeg", quality);

        // Downsample AFTER the full-size render — see ShotOptions in capture.ts
        // for why this is not simply a smaller render target.
        const scale = maxPx / Math.max(w, h);
        const small = document.createElement("canvas");
        small.width = Math.max(1, Math.round(w * scale));
        small.height = Math.max(1, Math.round(h * scale));
        const smallCtx = small.getContext("2d");
        if (!smallCtx) return out.toDataURL("image/jpeg", quality);
        smallCtx.imageSmoothingQuality = "high";
        smallCtx.drawImage(out, 0, 0, small.width, small.height);
        return small.toDataURL("image/jpeg", quality);
      }),
    [gl, scene, camera],
  );
  return null;
}

/**
 * SUPERSAMPLING WHILE NOBODY IS TOUCHING IT.
 *
 * The studio is static almost all of the time, and a static frame is where the
 * quality is cheapest to buy. Once the scene settles the drawing buffer is
 * rendered at a higher pixel ratio and downsampled, which is real supersampling
 * — the facet edges of a brilliant cut are a picket fence of near-mirror
 * boundaries, and MSAA only ever antialiases geometry, not the specular
 * highlights fizzing along them.
 *
 * It drops straight back the instant anything moves, so nothing is paid for
 * during a drag, an orbit or an agent edit — exactly the moments the frame rate
 * is visible.
 *
 * This is NOT the progressive light accumulation it might look like. With no
 * shadow-casting lights in this scene — the light is all environment — jittered
 * accumulation would reduce to supersampling anyway, at the cost of a
 * ping-pong buffer and taking over the render loop from a working
 * StudioCapture. Same result, a fraction of the risk.
 *
 * And it self-limits: if the boosted frame rate cannot hold up, it gives up on
 * the boost permanently rather than serving a smooth machine and a slideshow to
 * everyone else.
 */
const IDLE_MS = 550;
const BOOST = 1.5;
const BOOST_FLOOR_FPS = 40;

function IdleQuality({ design, mode }: { design: DesignState; mode: GemMode }) {
  const gl = useThree((s) => s.gl);
  const setDpr = useThree((s) => s.setDpr);
  const controls = useThree((s) => s.controls) as { addEventListener: EventTarget["addEventListener"]; removeEventListener: EventTarget["removeEventListener"] } | null;

  const base = useMemo(() => Math.min(window.devicePixelRatio || 1, 2), []);
  const boosted = useRef(false);
  const allowed = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const meter = useRef({ frames: 0, elapsed: 0 });

  useEffect(() => {
    const drop = () => {
      if (boosted.current) {
        boosted.current = false;
        setDpr(base);
      }
      if (timer.current) clearTimeout(timer.current);
      if (!allowed.current) return;
      timer.current = setTimeout(() => {
        boosted.current = true;
        meter.current = { frames: 0, elapsed: 0 };
        setDpr(Math.min(base * BOOST, 3));
      }, IDLE_MS);
    };

    drop();
    const canvas = gl.domElement;
    for (const e of ["pointerdown", "pointermove", "wheel"] as const) {
      canvas.addEventListener(e, drop, { passive: true });
    }
    controls?.addEventListener("change", drop);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const e of ["pointerdown", "pointermove", "wheel"] as const) {
        canvas.removeEventListener(e, drop);
      }
      controls?.removeEventListener("change", drop);
    };
    // A design or mode change is activity too — it rebuilds geometry and
    // materials, and the boost should not be in force while that lands.
  }, [gl, controls, setDpr, base, design, mode]);

  useFrame((_, dt) => {
    if (!boosted.current || !allowed.current) return;
    const m = meter.current;
    m.frames += 1;
    m.elapsed += dt;
    if (m.elapsed < 1.4) return;
    const fps = m.frames / m.elapsed;
    m.frames = 0;
    m.elapsed = 0;
    if (fps >= BOOST_FLOOR_FPS) return;
    // Measured once, then never attempted again for this session.
    allowed.current = false;
    boosted.current = false;
    setDpr(base);
  });

  return null;
}

/** Applies exposure after mount, since onCreated only runs once. */
function Exposure({ value }: { value: number }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMappingExposure = value;
  }, [gl, value]);
  return null;
}

export function RingScene3D({
  design,
  mode,
  exposure,
  glare,
  tone,
  spinning,
  fpsRef,
  onDragChange,
}: {
  design: DesignState;
  mode: GemMode;
  /** Renderer exposure. Moves the whole studio together instead of letting
   *  individual lamps drift apart. */
  exposure: number;
  /** Bloom intensity — how far a specular bleeds past its own edge. Separate
   *  from `exposure` because the two failures look alike and are not: turning
   *  the light down darkens the gold long before it stops the stone flaring,
   *  since the stone is already clipping at any exposure worth using. */
  glare: number;
  /** The paper behind the ring. Backdrop only — the lights do not move. */
  tone: BackdropTone;
  /** Turntable: orbits the camera slowly so the ring can be watched rather than driven. */
  spinning: boolean;
  fpsRef: React.RefObject<HTMLSpanElement | null>;
  /** Raised while a stone is being dragged, so the page can stop easing. */
  onDragChange: (dragging: boolean) => void;
}) {
  const ring = useRef<Group>(null);
  // Built inside onCreated because it needs the renderer; held in state so the
  // gem materials pick it up on the next render.
  const [gemEnv, setGemEnv] = useState<Texture | null>(null);
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ position: VIEWS.top.camera, fov: VIEWS.top.fov, near: 0.1, far: 400 }}
      onCreated={({ gl, scene }) => {
        // ACESFilmic (R3F's default) rolls off exactly the saturated speculars
        // that make a gem read as a gem. Khronos PBR Neutral keeps them.
        gl.toneMapping = NeutralToneMapping;
        gl.toneMappingExposure = exposure;
        scene.environment = buildStudioEnvironment(gl);
        scene.environmentIntensity = 1.35;
        setGemEnv(buildGemEnvironment(gl));
      }}
    >
      <Exposure value={exposure} />
      <Backdrop tone={tone} />

      <group ref={ring}>
        <Ring3D
          design={design}
          mode={mode}
          gemEnv={gemEnv}
          ringRef={ring}
          onDragChange={onDragChange}
        />
      </group>

      <OrbitControls
        makeDefault
        /* The turntable. drei already calls update() every frame because
           damping is on, so this needs no loop of its own — and orbiting the
           CAMERA rather than spinning the ring keeps the view rig's quaternion
           the single owner of the ring's orientation. */
        autoRotate={spinning}
        autoRotateSpeed={0.9}
        enablePan={false}
        minDistance={22}
        maxDistance={120}
        enableDamping
        dampingFactor={0.09}
        target={VIEWS.top.target}
      />
      <ViewRig design={design} ring={ring} />
      <IdleQuality design={design} mode={mode} />

      {/*
        BLOOM. The one post effect worth its cost here.

        A photographed gem does not have a hard edge where a specular ends —
        the lens and the eye both bleed a bright point into what surrounds it,
        and on a stone whose whole appearance IS bright points that bleed is a
        large part of what says "photograph". Threshold sits high on purpose so
        only the actual speculars glow; drop it and the gold turns to fog.

        Only the INTENSITY is on a slider. Putting the threshold on one too was
        tempting and would have been worse: the two interact, so the control
        stops being monotonic — halfway along could look glarier than either
        end — and there is no defensible default left to return to.

        The composer forces the renderer's tone mapping off and does it in the
        final pass instead, so NeutralToneMapping has to be restated here to
        keep the studio looking the way it did before the effect existed.
      */}
      <EffectComposer multisampling={4}>
        <Bloom
          intensity={glare}
          luminanceThreshold={0.95}
          luminanceSmoothing={0.1}
          radius={0.5}
          mipmapBlur
        />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      </EffectComposer>
      <FrameMeter node={fpsRef} />
      <StudioCapture />
      <Diagnostics />
      <HiddenTabTick />
    </Canvas>
  );
}
