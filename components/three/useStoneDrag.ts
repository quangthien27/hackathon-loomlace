"use client";

/* eslint-disable react-hooks/immutability -- see below */
/*
 * Same friction as RingScene3D: a pointer drag is imperative by nature. It
 * writes to refs between renders, toggles `controls.enabled` on an object three
 * owns, and attaches window listeners — none of which the React Compiler rules
 * model. The alternative is to route every pointermove through React state,
 * which would re-render the whole scene sixty times a second to move one stone.
 */

import { useThree } from "@react-three/fiber";
import { useCallback, useRef } from "react";
import { Matrix4, Raycaster, Vector2, Vector3, type Group } from "three";
import { centreStone, clamp } from "@/lib/design";
import { STONE_ARC_DEG } from "@/lib/render/contract";
import { placeStone } from "@/lib/render3d/scene";
import { useDesign } from "@/lib/store";

/**
 * Dragging a stone, in three dimensions.
 *
 * The SVG renderer could invert its own projection because it WAS a projection.
 * Here the honest equivalent is to intersect the pointer's ray with the surface
 * the stone is actually sitting on — the cylinder of the band's outer face —
 * and read the hit back as an angle and an axial offset. That is solved
 * analytically rather than by adding an invisible collider, because a collider
 * would be one more thing that has to stay in sync with the band's dimensions.
 *
 * All of it happens in the RING'S local space, so it keeps working whatever the
 * current view has done to the ring's orientation.
 */

const raycaster = new Raycaster();
const ndc = new Vector2();
const inverse = new Matrix4();
const hit = new Vector3();

type BandHit = { x: number };

/** Nearest intersection of a ray with an infinite cylinder about the Y axis. */
function intersectBandCylinder(
  origin: Vector3,
  direction: Vector3,
  radius: number,
): Vector3 | null {
  const a = direction.x * direction.x + direction.z * direction.z;
  if (a < 1e-9) return null; // ray runs straight down the finger axis
  const b = 2 * (origin.x * direction.x + origin.z * direction.z);
  const c = origin.x * origin.x + origin.z * origin.z - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const root = Math.sqrt(disc);
  const near = (-b - root) / (2 * a);
  const far = (-b + root) / (2 * a);
  // The near hit is the face towards the camera, which is the one being grabbed.
  const t = near > 0 ? near : far;
  if (t <= 0) return null;

  return hit.copy(direction).multiplyScalar(t).add(origin);
}

export function useStoneDrag(
  ring: React.RefObject<Group | null>,
  onDragChange: (dragging: boolean) => void,
) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;

  const active = useRef<string | null>(null);
  /**
   * The radius of the cylinder the dragged stone actually travels on.
   *
   * NOT the band's outer radius: a stone sits proud of the band by its own
   * pavilion depth plus the setting's clearance, so intersecting the band's
   * surface finds a point several millimetres away from the stone and the axial
   * reading comes back wrong — badly enough that `y` pins to an edge on the
   * first move. Captured once per drag because the seat does not change while
   * the stone is only moving along the band.
   */
  const surface = useRef(0);
  // Offset from the grab point to the stone's own position, so picking a stone
  // up by its edge does not snap its centre under the cursor.
  const offset = useRef(0);

  const sample = useCallback(
    (clientX: number, clientY: number): BandHit | null => {
      const group = ring.current;
      if (!group) return null;

      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);

      // Into the ring's own frame, where the band is a cylinder about Y.
      inverse.copy(group.matrixWorld).invert();
      const origin = raycaster.ray.origin.clone().applyMatrix4(inverse);
      const direction = raycaster.ray.direction
        .clone()
        .transformDirection(inverse)
        .normalize();

      const point = intersectBandCylinder(origin, direction, surface.current);
      if (!point) return null;

      // Same conventions as lib/render3d/scene.ts: angle 0 is +Z and x = 0.5.
      const deg = (Math.atan2(point.x, point.z) * 180) / Math.PI;
      return { x: deg / STONE_ARC_DEG + 0.5 };
    },
    [camera, gl, ring],
  );

  const onMove = useCallback(
    (e: PointerEvent) => {
      const id = active.current;
      if (!id) return;
      const p = sample(e.clientX, e.clientY);
      if (!p) return;
      // x ONLY. The band's axial extent is about 2mm on a 27mm object, and in
      // every view the finger axis points close to the view direction, so screen
      // motion maps to `y` chaotically — a 70px sideways drag would slam the
      // stone from one edge of the band to the other. Dragging a stone means
      // sliding it around the shank; `y` belongs to the slider and to the agent,
      // where it can be set to a number rather than flung to a limit.
      useDesign.getState().placeStone({ id, x: clamp(p.x + offset.current, 0, 1) });
    },
    [sample],
  );

  const end = useCallback(() => {
    if (active.current === null) return;
    active.current = null;
    // Reported from here rather than from a pointerup handler on the stone,
    // because a release with the cursor anywhere else never reaches the mesh.
    onDragChange(false);
    if (controls) controls.enabled = true;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
  }, [controls, onMove, onDragChange]);

  /** Call from a stone's onPointerDown. Returns true if a drag started. */
  const begin = useCallback(
    (stoneId: string, clientX: number, clientY: number): boolean => {
      const state = useDesign.getState().design;
      const stone = state.stones.find((s) => s.id === stoneId);
      if (!stone) return false;
      surface.current = placeStone(state, stone, centreStone(state)?.id === stone.id).radial;
      const p = sample(clientX, clientY);
      offset.current = p ? stone.x - p.x : 0;
      active.current = stoneId;
      onDragChange(true);
      // Otherwise the orbit controls spin the camera while the stone moves.
      if (controls) controls.enabled = false;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      return true;
    },
    [controls, end, onDragChange, onMove, sample],
  );

  return { begin, isDragging: () => active.current !== null };
}
