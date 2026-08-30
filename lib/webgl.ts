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

/**
 * Nudges React to re-read the snapshot once after mount.
 *
 * The value never changes, so the obvious `subscribe` is a no-op — but then the
 * only client read is during hydration, which is served the SERVER snapshot,
 * and a browser without WebGL would keep rendering the 3D branch forever. One
 * scheduled callback forces exactly one re-read at the moment `document` is
 * available to be asked.
 */
export function subscribeWebGL(onChange: () => void): () => void {
  const id = setTimeout(onChange, 0);
  return () => clearTimeout(id);
}

function detect(): boolean {
  if (typeof document === "undefined") return true;

  // `?nowebgl=1` forces the flat fallback. It can only ever DOWNGRADE the
  // renderer, never claim support that isn't there, so it is safe to leave in
  // the deployed build — and it is the only practical way to check what the
  // fallback looks like on a device whose browser does support WebGL.
  if (typeof location !== "undefined" && new URLSearchParams(location.search).has("nowebgl"))
    return false;

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
