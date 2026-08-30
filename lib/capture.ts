/**
 * A still of the studio, handed to the order page.
 *
 * The order page used to redraw the design with the flat SVG renderer, which
 * meant the ring you spent ten minutes lighting and turning was not the ring
 * you were shown when you went to buy it. A photograph of the actual studio is
 * both more honest and more persuasive.
 *
 * It travels through localStorage rather than the URL: a JPEG of a 3D canvas
 * runs to a couple of hundred kilobytes, which no query string will carry. The
 * URL only says whether a shot exists, so /order stays a plain renderer of
 * whatever it was handed — and still works from a link pasted onto another
 * device, where it falls back to drawing the design itself.
 */

const SHOT_KEY = "loomlace:shot";

type Capturer = () => string | null;

let capturer: Capturer | null = null;

/** Called by the scene once it has a renderer. Returns an unregister function. */
export function registerStudioCapture(fn: Capturer): () => void {
  capturer = fn;
  return () => {
    if (capturer === fn) capturer = null;
  };
}

/** A JPEG data URL of the live canvas, or null if no 3D scene is mounted. */
export function captureStudioShot(): string | null {
  try {
    return capturer?.() ?? null;
  } catch {
    return null;
  }
}

/** Returns whether the shot was stored — localStorage can be full or blocked. */
export function stashShot(dataUrl: string | null): boolean {
  if (!dataUrl) return false;
  try {
    localStorage.setItem(SHOT_KEY, dataUrl);
    cached = dataUrl;
    return true;
  } catch {
    return false;
  }
}

/**
 * Memoised, because this is read through useSyncExternalStore and a snapshot
 * that hits localStorage on every call would fail the "getSnapshot should be
 * cached" invariant — and re-read a quarter of a megabyte to do it.
 */
let cached: string | null | undefined;

export function readShot(): string | null {
  if (cached === undefined) {
    try {
      cached = localStorage.getItem(SHOT_KEY);
    } catch {
      cached = null;
    }
  }
  return cached;
}

/** The server has no localStorage, so it always renders the fallback. */
export const noShot = () => null;

/** Fires once after mount so the client value replaces the server's. */
export function subscribeShot(onChange: () => void): () => void {
  const id = setTimeout(onChange, 0);
  return () => clearTimeout(id);
}
