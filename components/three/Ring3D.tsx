"use client";

import { useEffect, useMemo } from "react";
import { BackSide, ExtrudeGeometry, LatheGeometry, Shape, type Texture } from "three";
import { centreStone, type DesignState, type Metal, type Stone, type StoneType } from "@/lib/design";
import {
  bandProfile,
  cutFootprint,
  gemDepth,
  gemGeometry,
  girdleOutline,
  pavilionDepth,
  type GemCut,
} from "@/lib/render3d/geometry";
import { GEM_CORE, GEM_PBR, GEM_SPECULAR, MELEE_PBR, METAL_PBR } from "@/lib/render3d/materials3d";
import { bandDims, haloRing, paveRun, placeStone } from "@/lib/render3d/scene";

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
  const profile = design.band.profile;

  const geometry = useMemo(
    () => new LatheGeometry(bandProfile(profile, innerR, thickness, width), 256),
    [profile, innerR, thickness, width],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  const pbr = METAL_PBR[design.band.metal];
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        metalness={1}
        roughness={pbr.roughness}
        color={pbr.color}
        envMapIntensity={METAL_ENV}
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
    <mesh geometry={gemGeometry("round")} scale={radius}>
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

/** Claw angles. Fancy cuts are held at their corners; round stones are not. */
function clawAngles(cut: GemCut): number[] {
  return cut === "princess" || cut === "emerald" ? [45, 135, 225, 315] : [42, 138, 222, 318];
}

/**
 * Four claws. Each is a tapered shaft rising alongside the girdle with a bead
 * folded over the crown — the bead is what actually retains the stone, and
 * leaving it off is why untextured 3D settings read as flat metal tabs.
 */
function Claws({ cut, radius, metal }: { cut: GemCut; radius: number; metal: Metal }) {
  const [fx, fz] = cutFootprint(cut);
  // The shaft stops just under the table and the bead does the rest. Longer
  // posts read as scaffolding, especially at an oblique angle where the stone
  // foreshortens but the claws do not.
  const shaftH = radius * 0.78;

  return (
    <group>
      {clawAngles(cut).map((deg) => {
        const a = (deg * Math.PI) / 180;
        const x = Math.sin(a) * radius * fx;
        const z = Math.cos(a) * radius * fz;
        return (
          <group key={deg}>
            <mesh position={[x * 1.02, -radius * 0.2, z * 1.02]}>
              <cylinderGeometry args={[radius * 0.085, radius * 0.16, shaftH, 12]} />
              <MetalMat metal={metal} />
            </mesh>
            {/* Bead, pulled inboard so it sits ON the crown rather than beside it. */}
            <mesh position={[x * 0.84, radius * 0.24, z * 0.84]} scale={[1, 0.72, 1]}>
              <sphereGeometry args={[radius * 0.125, 20, 16]} />
              <MetalMat metal={metal} />
            </mesh>
          </group>
        );
      })}
      {/* Gallery rail under the girdle: closes the setting off from below. */}
      <mesh position={[0, -radius * 0.52, 0]} rotation-x={Math.PI / 2} scale={[fx, fz, 1]}>
        <torusGeometry args={[radius * 0.82, radius * 0.07, 12, 48]} />
        <MetalMat metal={metal} />
      </mesh>
    </group>
  );
}

/** A wall of metal following the girdle outline. */
function Bezel({ cut, radius, metal }: { cut: GemCut; radius: number; metal: Metal }) {
  const geometry = useMemo(() => {
    const outer = new Shape(girdleOutline(cut, radius * 1.13));
    outer.holes.push(new Shape(girdleOutline(cut, radius * 1.0)));
    const depth = radius * 0.72;
    const g = new ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 24 });
    // The shape is authored in the girdle plane, so stand it up and straddle the girdle.
    g.rotateX(-Math.PI / 2);
    g.translate(0, radius * 0.22, 0);
    return g;
  }, [cut, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group>
      <mesh geometry={geometry}>
        <MetalMat metal={metal} />
      </mesh>
      {/* Collar below, so the bezel does not float on nothing in the side view. */}
      <mesh position={[0, -radius * 0.62, 0]} rotation-x={Math.PI} scale={[1, 1, 1]}>
        <coneGeometry args={[radius * 1.02, radius * 0.7, 32, 1, true]} />
        <MetalMat metal={metal} roughnessBoost={0.06} />
      </mesh>
    </group>
  );
}

/** Halo: a close ring of melee on a metal rail, with bead prongs in the gaps. */
function Halo({ cut, radius, metal, env }: { cut: GemCut; radius: number; metal: Metal; env: Texture | null }) {
  const ring = haloRing(radius);
  return (
    <group position={[0, -radius * 0.05, 0]}>
      <mesh rotation-x={Math.PI / 2}>
        <torusGeometry args={[radius * 1.3, radius * 0.13, 14, 64]} />
        <MetalMat metal={metal} />
      </mesh>
      {ring.map((s, i) => (
        <group key={s.key}>
          <group position={[s.x, radius * 0.11, s.z]}>
            <Melee radius={s.radius} env={env} />
          </group>
          {/* One bead between each neighbouring pair. */}
          <mesh
            position={[
              Math.sin(s.angle + Math.PI / ring.length) * radius * 1.3,
              radius * 0.16,
              Math.cos(s.angle + Math.PI / ring.length) * radius * 1.3,
            ]}
          >
            <sphereGeometry args={[radius * 0.055, 10, 8]} />
            <MetalMat metal={metal} />
          </mesh>
          {i === 0 ? null : null}
        </group>
      ))}
      <Claws cut={cut} radius={radius} metal={metal} />
    </group>
  );
}

/* ─────────────────────────────── the ring ─────────────────────────────── */

export function Ring3D({ design, mode, gemEnv }: { design: DesignState; mode: GemMode; gemEnv: Texture | null }) {
  const centre = centreStone(design);

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
            <group position={[0, p.axial, p.radial]} rotation-x={Math.PI / 2}>
              {isCentre && design.setting === "solitaire" && (
                <Claws cut={cut} radius={p.radius} metal={design.band.metal} />
              )}
              {isCentre && design.setting === "pave" && (
                <Claws cut={cut} radius={p.radius} metal={design.band.metal} />
              )}
              {isCentre && design.setting === "bezel" && (
                <Bezel cut={cut} radius={p.radius} metal={design.band.metal} />
              )}
              {isCentre && design.setting === "halo" && (
                <Halo cut={cut} radius={p.radius} metal={design.band.metal} env={gemEnv} />
              )}
              <Gem cut={cut} type={stone.type} radius={p.radius} mode={mode} env={gemEnv} />
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
