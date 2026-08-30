"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  BackSide,
  CatmullRomCurve3,
  ExtrudeGeometry,
  type Group,
  LatheGeometry,
  Shape,
  type Texture,
  TubeGeometry,
  Vector3,
} from "three";
import { centreStone, type DesignState, type Metal, type Stone, type StoneType } from "@/lib/design";
import {
  bandProfile,
  clawAnchors,
  gemDepth,
  gemGeometry,
  girdleOutline,
  loftedSkirt,
  outlineRing,
  pavilionDepth,
  type GemCut,
} from "@/lib/render3d/geometry";
import { GEM_CORE, GEM_PBR, GEM_SPECULAR, MELEE_PBR, METAL_PBR } from "@/lib/render3d/materials3d";
import { buildEngravingTexture } from "@/lib/render3d/engraving3d";
import { bandDims, haloRing, paveRun, placeStone } from "@/lib/render3d/scene";
import { useStoneDrag } from "./useStoneDrag";

/**
 * How the centre stone is rendered. Neither option is "right": see GEM_SPECULAR.
 * Exposed as a switch because the whole point of the spike is to look at both.
 */
export type GemMode = "refractive" | "refractive-core" | "specular";

/** Environment contribution. Metal is nearly a pure mirror, so this is most of its look. */
const METAL_ENV = 1.9;
const GEM_ENV = 3.8;

/* ─────────────────────────────── band ─────────────────────────────── */

function Band({ design }: { design: DesignState }) {
  const { innerR, thickness, width } = bandDims(design);
  const profileName = design.band.profile;
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());

  const profile = useMemo(
    () => bandProfile(profileName, innerR, thickness, width),
    [profileName, innerR, thickness, width],
  );

  const geometry = useMemo(() => new LatheGeometry(profile.points, 256), [profile]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // Keyed on the engraving's own fields rather than on the object, so that a
  // design tween — which rebuilds the design object every frame — does not
  // regenerate a 2048px canvas sixty times a second.
  const eng = design.engraving;
  const pbr = METAL_PBR[design.band.metal];
  const engraved = useMemo(
    () => buildEngravingTexture(eng, profile, pbr.roughness, maxAnisotropy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eng?.text, eng?.font, eng?.placement, profile, pbr.roughness, maxAnisotropy],
  );
  useEffect(() => () => engraved?.texture.dispose(), [engraved]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      {/* Keyed on whether a map exists, which forces React to build a NEW
          material rather than mutate the old one. three compiles a material's
          shader from the maps present when it is created: a band that started
          life without an engraving has no USE_BUMPMAP define, so assigning
          bumpMap later sets a property the shader never reads and the
          engraving silently does not appear. */}
      <meshStandardMaterial
        key={engraved ? "engraved" : "plain"}
        metalness={1}
        roughness={engraved?.roughness ?? pbr.roughness}
        roughnessMap={engraved?.texture ?? null}
        color={pbr.color}
        envMapIntensity={METAL_ENV}
        bumpMap={engraved?.texture ?? null}
        bumpScale={engraved?.bumpScale ?? 0}
      />
    </mesh>
  );
}

/* ─────────────────────────────── gems ─────────────────────────────── */

/**
 * The centre stone. Two meshes, not one.
 *
 * The outer shell is the real refractive surface. The inner core exists because
 * three's `transmission` is a SCREEN-SPACE approximation: it bends what is
 * behind the stone, but light never bounces around inside it, and multiple
 * internal reflection is exactly what makes a diamond look like a diamond
 * rather than like a glass pebble. A slightly smaller flat-shaded shell facing
 * inward gives the refraction something to find in there — a cheap stand-in for
 * the pavilion reflecting back at you. It is a cheat, and it is the difference
 * between "gem" and "bead".
 */
function Gem({
  cut,
  type,
  radius,
  mode,
  env,
}: {
  cut: GemCut;
  type: StoneType;
  radius: number;
  mode: GemMode;
  env: Texture | null;
}) {
  const geometry = gemGeometry(cut);
  const pbr = GEM_PBR[type];

  if (mode === "specular") {
    const spec = GEM_SPECULAR[type];
    return (
      <mesh geometry={geometry} scale={radius}>
        <meshPhysicalMaterial
          flatShading
          metalness={0}
          roughness={0.012}
          color={spec.color}
          ior={pbr.ior}
          specularIntensity={1}
          envMap={env}
          envMapIntensity={spec.env}
        />
      </mesh>
    );
  }

  return (
    <group scale={radius}>
      {mode === "refractive-core" && (
        <mesh geometry={geometry} scale={0.86}>
          <meshPhysicalMaterial
            side={BackSide}
            flatShading
            metalness={0}
            roughness={0.015}
            color={GEM_CORE[type]}
            envMap={env}
            envMapIntensity={3.6}
            specularIntensity={1}
          />
        </mesh>
      )}
      <mesh geometry={geometry}>
        <meshPhysicalMaterial
          flatShading
          transmission={1}
          /* Local units: three multiplies this by the model matrix scale. */
          thickness={gemDepth(cut)}
          ior={pbr.ior}
          dispersion={pbr.dispersion}
          attenuationColor={pbr.attenuationColor}
          attenuationDistance={pbr.attenuationDistance}
          roughness={pbr.roughness}
          metalness={0}
          color="#ffffff"
          envMap={env}
          envMapIntensity={GEM_ENV}
          specularIntensity={1}
        />
      </mesh>
    </group>
  );
}

/** A melee stone: same facets, no transmission. See MELEE_PBR for why. */
function Melee({ radius, env }: { radius: number; env: Texture | null }) {
  return (
    <mesh geometry={gemGeometry("melee")} scale={radius}>
      <meshPhysicalMaterial flatShading {...MELEE_PBR} envMap={env} />
    </mesh>
  );
}

/* ─────────────────────────────── settings ─────────────────────────────── */

function MetalMat({ metal, roughnessBoost = 0 }: { metal: Metal; roughnessBoost?: number }) {
  const pbr = METAL_PBR[metal];
  return (
    <meshStandardMaterial
      metalness={1}
      roughness={pbr.roughness + roughnessBoost}
      color={pbr.color}
      envMapIntensity={METAL_ENV}
    />
  );
}

/**
 * A metal rail following the stone's outline, at a given height.
 *
 * A torus would only be right for a round stone. This is swept along the cut's
 * own rim, so the gallery under a princess is square and the halo around an
 * emerald is an emerald.
 */
function Rail({
  cut,
  radius,
  scale,
  y,
  tube,
  metal,
  bandOuterR,
  bandSeatDepth,
}: {
  cut: GemCut;
  radius: number;
  scale: number;
  /** Height of the rail when it is not following the band. */
  y: number;
  tube: number;
  metal: Metal;
  /**
   * When given, the rail is laid ON the band rather than at a fixed height.
   *
   * A gallery rail at a constant y is a flat hoop, and the band it is supposed
   * to sit on is a cylinder — so the rail touched at its nearest point and
   * floated everywhere else. Solving each point of the path against the band's
   * curve lets the whole rail land, and puts it at the same depth the claw
   * shafts reach, so the two actually meet instead of merely crossing.
   *
   * Passed as two numbers rather than one object so the memo below can depend
   * on them directly; an object literal would be a fresh reference every render
   * and rebuild the tube sixty times a second.
   */
  bandOuterR?: number;
  bandSeatDepth?: number;
}) {
  const geometry = useMemo(() => {
    const points = outlineRing(cut, radius * scale, 64).map(([x, z]) => {
      if (bandOuterR === undefined || bandSeatDepth === undefined) return new Vector3(x, y, z);
      const surface =
        Math.sqrt(Math.max(0, bandOuterR * bandOuterR - x * x)) - (bandOuterR + bandSeatDepth);
      // Centred one tube-radius up, so the underside of the rail rests on the
      // metal rather than being buried half inside it.
      return new Vector3(x, surface + tube, z);
    });
    const curve = new CatmullRomCurve3(points, true, "catmullrom", 0.05);
    return new TubeGeometry(curve, 128, tube, 10, true);
  }, [cut, radius, scale, y, tube, bandOuterR, bandSeatDepth]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry}>
      <MetalMat metal={metal} />
    </mesh>
  );
}

/**
 * Four claws, each running from a bead folded over the crown all the way DOWN
 * to the band.
 *
 * `seatDepth` is what makes that possible: without it the shafts were a fixed
 * multiple of the stone's radius and simply stopped in mid-air above the shank,
 * which is what made the whole setting look like it was hovering.
 */
function Claws({
  cut,
  radius,
  metal,
  seatDepth,
  outerR,
}: {
  cut: GemCut;
  radius: number;
  metal: Metal;
  seatDepth: number;
  /** The band's outer radius, so each claw can be cut to meet its curve. */
  outerR: number;
}) {
  const beadY = radius * 0.26;

  /**
   * How far down a claw has to reach at a given sideways offset.
   *
   * `seatDepth` is only the distance to the band directly under the stone's
   * axis. The band is a CYLINDER, so it curves away to either side, and a claw
   * standing a couple of millimetres off-axis has further to travel. Cutting
   * every claw to the same length is why the stone appeared to touch the shank
   * at its culet and nowhere else — the four posts stopped short in mid-air.
   */
  const seatRadius = outerR + seatDepth;
  const footAt = (offset: number) =>
    Math.sqrt(Math.max(0, outerR * outerR - offset * offset)) - seatRadius;

  // Sunk a little into the metal so the joint is a joint, not a butt contact.
  const bite = radius * 0.1;

  return (
    <group>
      {clawAnchors(cut, radius).map(([x, z], i) => {
        const px = x * 1.02;
        const pz = z * 1.02;
        const footY = footAt(px) - bite;
        const shaftH = beadY - footY;
        return (
          <group key={i}>
            <mesh position={[px, (beadY + footY) / 2, pz]}>
              <cylinderGeometry args={[radius * 0.085, radius * 0.15, shaftH, 12]} />
              <MetalMat metal={metal} />
            </mesh>
            {/* The bead sits just inboard of the shaft, folded over the crown —
                pulling it much further in reads as a stud floating on the table. */}
            <mesh position={[x * 0.94, beadY, z * 0.94]} scale={[1, 0.74, 1]}>
              <sphereGeometry args={[radius * 0.125, 20, 16]} />
              <MetalMat metal={metal} />
            </mesh>
          </group>
        );
      })}
      {/* Gallery rail, laid along the band at the same radius the shafts stand
          on, so the basket closes where the claws land instead of hovering
          somewhere above them. */}
      <Rail
        cut={cut}
        radius={radius}
        scale={1.02}
        y={-seatDepth}
        tube={radius * 0.075}
        metal={metal}
        bandOuterR={outerR}
        bandSeatDepth={seatDepth}
      />
    </group>
  );
}

/** A wall of metal around the girdle, on a skirt that reaches the band. */
function Bezel({
  cut,
  radius,
  metal,
  seatDepth,
}: {
  cut: GemCut;
  radius: number;
  metal: Metal;
  seatDepth: number;
}) {
  // The rim closes over the girdle and stands a little proud of it — that lip
  // is what holds the stone in, and a bezel that stops below the girdle looks
  // like a collar the stone is resting in rather than one gripping it.
  const wallTop = radius * 0.2;
  const wallBottom = -radius * 0.12;

  const wall = useMemo(() => {
    const outer = new Shape(girdleOutline(cut, radius * 1.13));
    outer.holes.push(new Shape(girdleOutline(cut, radius * 1.0)));
    const g = new ExtrudeGeometry(outer, {
      depth: wallTop - wallBottom,
      bevelEnabled: false,
      curveSegments: 24,
    });
    // Authored in the girdle plane, so stand it up and straddle the girdle.
    // rotateX(-90) maps the extrusion from +z onto +y, i.e. 0..depth — so the
    // offset has to be the wall's BOTTOM. Translating by the top instead lifted
    // the whole rim a full wall-height clear of the skirt, which is what left
    // the two pieces visibly unconnected.
    g.rotateX(-Math.PI / 2);
    g.translate(0, wallBottom, 0);
    return g;
  }, [cut, radius, wallTop, wallBottom]);
  useEffect(() => () => wall.dispose(), [wall]);

  // The under-bezel runs from the wall to the band and follows the cut the
  // whole way. It replaces a cone, which was round whatever the stone was and
  // whose apex went straight through the shank once the stone got big.
  // Tapered to follow the pavilion down to the band, then CUT FLAT rather than
  // run to a point. A cone touching the shank at a single vertex reads as a
  // spike balanced on the ring; a real under-bezel is sawn off and soldered on
  // a face. The cut sits a little inside the metal so the joint closes.
  const footScale = 0.42;
  const skirt = useMemo(
    () => loftedSkirt(cut, radius, 1.13, wallBottom, footScale, -seatDepth - radius * 0.06, true),
    [cut, radius, wallBottom, seatDepth, footScale],
  );
  useEffect(() => () => skirt.dispose(), [skirt]);

  return (
    <group>
      <mesh geometry={wall}>
        <MetalMat metal={metal} />
      </mesh>
      <mesh geometry={skirt}>
        <MetalMat metal={metal} roughnessBoost={0.05} />
      </mesh>
    </group>
  );
}

/** Halo: melee following the centre stone's outline, on a rail, with bead prongs. */
function Halo({
  cut,
  radius,
  metal,
  seatDepth,
  outerR,
  env,
}: {
  cut: GemCut;
  radius: number;
  metal: Metal;
  seatDepth: number;
  outerR: number;
  env: Texture | null;
}) {
  const ring = haloRing(cut, radius);
  const scale = ring.length ? Math.hypot(ring[0].x, ring[0].z) / radius : 1.3;

  return (
    <group>
      <Rail cut={cut} radius={radius} scale={scale} y={-radius * 0.02} tube={radius * 0.12} metal={metal} />
      {ring.map((s, i) => {
        const next = ring[(i + 1) % ring.length];
        return (
          <group key={s.key}>
            <group position={[s.x, radius * 0.1, s.z]}>
              <Melee radius={s.radius} env={env} />
            </group>
            {/* One bead in the gap between each neighbouring pair. */}
            <mesh position={[(s.x + next.x) / 2, radius * 0.15, (s.z + next.z) / 2]}>
              <sphereGeometry args={[radius * 0.05, 10, 8]} />
              <MetalMat metal={metal} />
            </mesh>
          </group>
        );
      })}
      <Claws cut={cut} radius={radius} metal={metal} seatDepth={seatDepth} outerR={outerR} />
    </group>
  );
}

/**
 * Reports where the centre stone actually lands on screen — DEV ONLY.
 *
 * Without this, testing a drag means guessing at pixel coordinates, and a
 * pointerdown that misses the stone is not inert: it falls through to the orbit
 * controls and spins the camera, which invalidates every subsequent guess.
 */
function CentreProbe() {
  const ref = useRef<Group>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useFrame(() => {
    if (process.env.NODE_ENV !== "development" || !ref.current) return;
    const p = ref.current.getWorldPosition(PROBE).project(camera);
    document.documentElement.dataset.centreStone = JSON.stringify({
      x: Math.round(((p.x + 1) / 2) * size.width),
      y: Math.round(((1 - p.y) / 2) * size.height),
    });
  });
  return <group ref={ref} />;
}

const PROBE = new Vector3();

/* ─────────────────────────────── the ring ─────────────────────────────── */

export function Ring3D({
  design,
  mode,
  gemEnv,
  ringRef,
  onDragChange,
}: {
  design: DesignState;
  mode: GemMode;
  gemEnv: Texture | null;
  ringRef: React.RefObject<Group | null>;
  onDragChange: (dragging: boolean) => void;
}) {
  const centre = centreStone(design);
  const drag = useStoneDrag(ringRef, onDragChange);

  return (
    <group>
      <Band design={design} />

      {/* Pave lives in BAND space, not stone space — the same reason as the SVG:
          it follows the shoulders, so it must not inherit the centre stone's seat. */}
      {design.setting === "pave" &&
        centre &&
        paveRun(design, centre).map((p) => (
          <group key={p.key} rotation-y={p.angle}>
            <group position={[0, p.axial, p.radial]} rotation-x={Math.PI / 2}>
              <Melee radius={p.radius} env={gemEnv} />
              {[45, 135, 225, 315].map((deg) => {
                const a = (deg * Math.PI) / 180;
                return (
                  <mesh
                    key={deg}
                    position={[Math.sin(a) * p.radius * 1.05, p.radius * 0.1, Math.cos(a) * p.radius * 1.05]}
                  >
                    <sphereGeometry args={[p.radius * 0.3, 10, 8]} />
                    <MetalMat metal={design.band.metal} />
                  </mesh>
                );
              })}
            </group>
          </group>
        ))}

      {design.stones.map((stone: Stone) => {
        const isCentre = centre?.id === stone.id;
        const p = placeStone(design, stone, isCentre);
        const cut = stone.cut as GemCut;
        return (
          <group key={stone.id} rotation-y={p.angle}>
            {/* rotation-x turns the gem's table normal to point radially outward. */}
            <group
              position={[0, p.axial, p.radial]}
              rotation-x={Math.PI / 2}
              onPointerDown={(e) => {
                e.stopPropagation();
                drag.begin(stone.id, e.clientX, e.clientY);
              }}
            >
              {isCentre && (design.setting === "solitaire" || design.setting === "pave") && (
                <Claws
                  cut={cut}
                  radius={p.radius}
                  metal={design.band.metal}
                  seatDepth={p.seatDepth}
                  outerR={bandDims(design).outerR}
                />
              )}
              {isCentre && design.setting === "bezel" && (
                <Bezel cut={cut} radius={p.radius} metal={design.band.metal} seatDepth={p.seatDepth} />
              )}
              {isCentre && design.setting === "halo" && (
                <Halo
                  cut={cut}
                  radius={p.radius}
                  metal={design.band.metal}
                  seatDepth={p.seatDepth}
                  outerR={bandDims(design).outerR}
                  env={gemEnv}
                />
              )}
              <Gem cut={cut} type={stone.type} radius={p.radius} mode={mode} env={gemEnv} />
              {isCentre && <CentreProbe />}
            </group>
          </group>
        );
      })}
    </group>
  );
}

/** Seat height above the band, used by the scene to frame the shot. */
export function stoneTopHeight(design: DesignState): number {
  const centre = centreStone(design);
  if (!centre) return bandDims(design).outerR;
  const p = placeStone(design, centre, true);
  return p.radial + (gemDepth(centre.cut as GemCut) - pavilionDepth(centre.cut as GemCut)) * p.radius;
}
