/**
 * THE POLISH. What stops the metal looking machined.
 *
 * Every metal surface here had one scalar roughness for the whole part, and a
 * perfectly uniform roughness is the single most reliable tell that a render is
 * a render. Real polished gold is finished by hand against a wheel: the surface
 * is very smooth but not EVENLY smooth, so the highlight rolls and wavers along
 * the band instead of lying down as a clean geometric stripe.
 *
 * Two frequencies, because the eye reads two different things:
 *
 *   - Broad, very low-frequency waviness. This is what actually shows. On a
 *     mirror the reflected softbox is a shape, and gentle roughness variation
 *     bends that shape's edge — the difference between a photograph and a CAD
 *     preview.
 *   - Fine lines running around the circumference, the way the wheel went.
 *     These sit under the resolution of any single glance and read as texture
 *     rather than as marks.
 *
 * The amplitude is deliberately small. This is a finish, not damage: enough to
 * break the perfect stripe, not enough for anyone to point at.
 *
 * Written into a roughnessMap's GREEN channel — the same channel and the same
 * convention lib/render3d/engraving3d.ts already uses — so an engraved band
 * gets polish and engraving off one canvas instead of the two fighting over the
 * single map slot.
 */

import { CanvasTexture, RepeatWrapping } from "three";

const WIDTH = 2048;
const HEIGHT = 512;

/**
 * Mean of the green channel, as a fraction.
 *
 * three MULTIPLIES material.roughness by the map, so a map averaging full white
 * could only ever make a surface rougher. Sitting the mean at 0.8 — and
 * dividing the material's own roughness by the same number — leaves the average
 * exactly where the material asked for it, with room to vary both ways.
 */
export const POLISH_BASE = 0.8;

/** Peak deviation as a fraction of the base. On yellow gold, ±18% of 0.17. */
const AMPLITUDE = 0.18;

/** Coarse grid the broad waviness is interpolated from. Wide, because the wheel runs around the band. */
const GRID_W = 40;
const GRID_H = 9;

/**
 * Deterministic noise.
 *
 * Math.random would give a different finish every time the texture is rebuilt,
 * so on a band the highlight would visibly reshuffle when you changed metal or
 * retyped an engraving. A fixed sequence makes the polish a property of the
 * object rather than of the moment it was drawn.
 */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Writes the polish into the green channel of whatever is already on the
 * canvas, centred on `baseGreen`.
 *
 * Per-pixel rather than composited: the green channel has to move DOWN as well
 * as up for the finish to average out where the material asked, and canvas
 * blend modes only really do one direction at a time. Red is left exactly as it
 * was found, because on an engraved band it is carrying the bump map.
 */
export function paintPolish(
  ctx: CanvasRenderingContext2D,
  baseGreen: number,
  seed = 20260903,
): void {
  const rand = seeded(seed);

  // Value-noise lattice, wrapping in x so the finish is seamless around the ring.
  const grid = new Float32Array(GRID_W * GRID_H);
  for (let i = 0; i < grid.length; i++) grid[i] = rand() * 2 - 1;
  const at = (gx: number, gy: number) =>
    grid[((gy + GRID_H) % GRID_H) * GRID_W + ((gx + GRID_W) % GRID_W)];

  // One value per row, so the fine lines run along u and stay unbroken.
  const lines = new Float32Array(HEIGHT);
  for (let y = 0; y < HEIGHT; y++) lines[y] = rand() * 2 - 1;

  const image = ctx.getImageData(0, 0, WIDTH, HEIGHT);
  const px = image.data;

  for (let y = 0; y < HEIGHT; y++) {
    const fy = (y / HEIGHT) * GRID_H;
    const gy = Math.floor(fy);
    const ty = smooth(fy - gy);

    for (let x = 0; x < WIDTH; x++) {
      const fx = (x / WIDTH) * GRID_W;
      const gx = Math.floor(fx);
      const tx = smooth(fx - gx);

      const top = at(gx, gy) * (1 - tx) + at(gx + 1, gy) * tx;
      const bottom = at(gx, gy + 1) * (1 - tx) + at(gx + 1, gy + 1) * tx;
      const broad = top * (1 - ty) + bottom * ty;

      // Broad waviness carries most of it; the wheel lines are a whisper on top.
      const n = broad * 0.78 + lines[y] * 0.22;
      const i = (y * WIDTH + x) * 4 + 1;
      px[i] = Math.max(0, Math.min(255, Math.round(baseGreen * (1 + n * AMPLITUDE))));
    }
  }

  ctx.putImageData(image, 0, 0);
}

/** Shared by every plain metal part; built once, never rebuilt. */
let cached: CanvasTexture | null = null;

/**
 * The polish map for metal carrying no engraving.
 *
 * One texture for the whole scene — the band, the claws, the bezel, the rails.
 * Their UVs differ, so the same noise lands at a different scale on each part,
 * which is if anything closer to a real set of separately finished components
 * than one map fitted individually to each.
 */
export function polishTexture(anisotropy: number): CanvasTexture {
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context for the polish map");

  const baseGreen = Math.round(POLISH_BASE * 255);
  ctx.fillStyle = `rgb(255, ${baseGreen}, 0)`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  paintPolish(ctx, baseGreen);

  const texture = new CanvasTexture(canvas);
  // Height and roughness data, not colour: no sRGB transfer, and no flipY, for
  // the reasons set out in engraving3d.ts.
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.flipY = false;
  // Mipmapped, unlike the engraving texture. That one turns filtering off to
  // keep glyph edges crisp; this one is minified hard whenever the ring is
  // small in frame, and unfiltered noise at minification is exactly the
  // shimmer the polish is supposed to be replacing.
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;

  cached = texture;
  return texture;
}
