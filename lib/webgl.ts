/**
 * Is WebGL actually available here?
 *
 * Worth checking rather than assuming. The studio's whole surface is a WebGL
 * canvas, and the browsers most likely to lack it are exactly the ones this is
 * built to be opened in: an in-app webview inside another application, a
 * locked-down corporate profile, a machine with a blocklisted GPU driver. In
 * all of those the canvas does not error — it simply never paints, and the page
 * looks broken rather than unsupported.
 *
 * The context is released immediately; this only asks the question.
 */
/**
 * Memoised, because this is read through useSyncExternalStore and a snapshot
 * that allocates a fresh canvas on every call would both churn and fail the
 * "getSnapshot should be cached" invariant.
 */
let cached: boolean | null = null;

export function hasWebGL(): boolean {
  if (cached !== null) return cached;
  cached = detect();
  return cached;
}

/** On the server, assume it works: the 3D canvas is client-only anyway, and
 *  guessing "no" would render the fallback into the HTML and flash it away. */
export const assumeWebGL = () => true;

function detect(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ??
      canvas.getContext("webgl") ??
      canvas.getContext("experimental-webgl");
    if (!gl) return false;
    (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
