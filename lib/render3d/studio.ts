/**
 * THE LIGHT. Built procedurally, downloaded from nowhere.
 *
 * Jewellery renders live or die on the environment: polished metal is almost
 * entirely a mirror, and a gem is a lens pointed at whatever is around it. A
 * generic room HDRI gives you soft grey metal and dull stones.
 *
 * So this is a jeweller's light tent rather than a room — a dark box with a few
 * bright rectangular softboxes. Dark surround + hard-edged sources is what
 * produces crisp specular streaks along the band and individual flashes off the
 * facets, instead of an even wash. It is also why we do not use drei's
 * <Environment preset>, which fetches an HDRI from a CDN at runtime: a demo that
 * needs the network to look right is a demo that fails on someone else's wifi.
 */

import {
  BackSide,
  CanvasTexture,
  EquirectangularReflectionMapping,
  SRGBColorSpace,
  BoxGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  type Texture,
  type WebGLRenderer,
} from "three";

type Panel = {
  /** width, height in scene units */
  size: [number, number];
  position: [number, number, number];
  /** euler radians */
  rotation: [number, number, number];
  color: string;
  intensity: number;
};

const PANELS: Panel[] = [
  // Key: a large overhead softbox. For a mirror-finish metal, panel AREA matters
  // more than panel brightness — a small bright source gives one hot dot and a
  // black band, a big one wraps the whole surface.
  { size: [26, 26], position: [0, 11, 0], rotation: [-Math.PI / 2, 0, 0], color: "#ffffff", intensity: 6.4 },
  // Front fill, so the surface facing the camera is not reading the dark wall.
  { size: [20, 14], position: [0, 1, 14], rotation: [0, 0, 0], color: "#eaf0ff", intensity: 3.4 },
  // Left and right verticals: these draw the long specular streaks down the band.
  { size: [10, 16], position: [-13, 1, 2], rotation: [0, Math.PI / 2, 0], color: "#ffffff", intensity: 3.6 },
  { size: [10, 16], position: [13, 1, -2], rotation: [0, -Math.PI / 2, 0], color: "#fff2df", intensity: 4.4 },
  // Floor bounce, so the pavilion has something to return and the underside of
  // the band is not a dead black edge.
  { size: [22, 22], position: [0, -10, 0], rotation: [Math.PI / 2, 0, 0], color: "#ffffff", intensity: 2.5 },
  // A dark card behind, which is what gives the metal an edge rather than an
  // even wash. The contrast between this and the panels IS the specular drawing.
  { size: [22, 18], position: [0, 1, -15], rotation: [0, Math.PI, 0], color: "#0c0c10", intensity: 1 },

  // Sparkle sources. Small, bright and scattered — these barely register on the
  // metal (too little solid angle to matter) but a gem's facets are mirrors
  // aimed in 57 directions, so what they need is MANY discrete hot points, not
  // more total light. Take these out and the stone goes back to reading as
  // smooth glass.
  { size: [2.2, 2.2], position: [-6, 8.5, 8], rotation: [-Math.PI / 3, -0.5, 0], color: "#ffffff", intensity: 22 },
  { size: [1.8, 1.8], position: [7, 8.5, 5], rotation: [-Math.PI / 3, 0.6, 0], color: "#fff6ea", intensity: 20 },
  { size: [1.6, 1.6], position: [0, 9, -7], rotation: [-Math.PI / 2.6, 0, 0], color: "#eaf2ff", intensity: 18 },
  { size: [2.4, 1.2], position: [-11, 2, -4], rotation: [0, Math.PI / 2, 0.3], color: "#ffffff", intensity: 16 },
  { size: [2.4, 1.2], position: [11, 3, 4], rotation: [0, -Math.PI / 2, -0.3], color: "#ffffff", intensity: 17 },
  { size: [1.4, 1.4], position: [-4, -7, 6], rotation: [Math.PI / 2.4, 0, 0], color: "#ffffff", intensity: 12 },
  { size: [1.4, 1.4], position: [5, -7, -3], rotation: [Math.PI / 2.4, 0, 0], color: "#fff2e0", intensity: 12 },
];

/**
 * `sigma` blurs the source slightly. A little blur keeps the softboxes reading
 * as light panels rather than as four white rectangles reflected in the gold.
 */
const BLUR = 0.012;

/**
 * The backdrop, and the reason it is not optional.
 *
 * three's `transmission` is screen-space: it refracts what is actually RENDERED
 * behind the object. With an empty background there is nothing behind the stone
 * to bend, so the gem samples black and reads as a dark pebble no matter how
 * good its ior and dispersion are. Real jewellery photography has the same
 * constraint — nobody shoots a diamond against a void.
 *
 * It wraps the scene as a sphere rather than standing behind it as a plane. A
 * plane has edges, and once the camera orbits far enough it sees them: the shot
 * turns into a lit rectangle floating on black. A sphere has nowhere to end.
 */
/**
 * The sweeps on offer, the way a photographer keeps a few rolls of paper.
 *
 * Only the BACKDROP changes. The lights above do not, which is deliberate: the
 * metal's reflections come from the PMREM environment, so swapping the paper
 * changes the mood and what the stone refracts without re-lighting the shoot
 * and sending every carefully-set panel intensity out of balance.
 *
 * `stops` runs pole to pole; `pool` is the pair of soft lights painted on it.
 */
export type BackdropTone = "studio" | "white" | "warm" | "noir";

export const BACKDROP_TONES: BackdropTone[] = ["studio", "white", "warm", "noir"];

export const BACKDROP_LABEL: Record<BackdropTone, string> = {
  studio: "studio grey",
  white: "white sweep",
  warm: "warm amber",
  noir: "noir",
};

const TONES: Record<
  BackdropTone,
  { stops: [number, string][]; pool: [string, string] }
> = {
  // The original: a warm neutral, dark at the poles, lifting to the horizon.
  studio: {
    stops: [
      [0, "#26252a"],
      [0.32, "#6f685e"],
      [0.5, "#8d8478"],
      [0.72, "#5a544b"],
      [1, "#232120"],
    ],
    pool: ["rgba(222,211,193,0.8)", "rgba(160,149,133,0.34)"],
  },
  // High key. Bright, almost shadowless — the catalogue look, and the one that
  // shows a metal's true colour rather than the room's.
  white: {
    stops: [
      [0, "#b9b8b6"],
      [0.3, "#e6e5e2"],
      [0.5, "#f4f3f1"],
      [0.74, "#dcdad6"],
      [1, "#a9a7a4"],
    ],
    pool: ["rgba(255,255,255,0.85)", "rgba(236,235,232,0.4)"],
  },
  // Warm amber, which is what gold is usually shot against — the surround pushes
  // the same direction as the metal instead of fighting it.
  warm: {
    stops: [
      [0, "#3a2a15"],
      [0.3, "#9a7238"],
      [0.5, "#c79a4e"],
      [0.72, "#7d5a2b"],
      [1, "#2c1f0f"],
    ],
    pool: ["rgba(255,226,168,0.82)", "rgba(196,152,84,0.36)"],
  },
  // Near-black, for the shot where the stone is the only bright thing in frame.
  noir: {
    stops: [
      [0, "#0a0a0c"],
      [0.34, "#1c1c20"],
      [0.5, "#2a2a30"],
      [0.72, "#17171b"],
      [1, "#070708"],
    ],
    pool: ["rgba(120,124,138,0.5)", "rgba(60,62,72,0.28)"],
  },
};

export function buildBackdropTexture(tone: BackdropTone = "studio"): CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const spec = TONES[tone] ?? TONES.studio;

  // A cyclorama, not a card: dark at the poles, lifting towards the horizon,
  // so wherever the camera turns there is a gradient rather than an edge.
  const vertical = ctx.createLinearGradient(0, 0, 0, h);
  for (const [at, colour] of spec.stops) vertical.addColorStop(at, colour);
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, w, h);

  // Soft pools of light so the stone always has something bright to refract and
  // the surround never goes flat. Two of them, half a turn apart, because the
  // camera orbits — one pool leaves the opposite side dead. Painted, not lit:
  // this is a backdrop, and the actual lighting comes from studio panels.
  for (const cx of [w * 0.25, w * 0.75]) {
    const pool = ctx.createRadialGradient(cx, h * 0.5, 0, cx, h * 0.5, w * 0.3);
    pool.addColorStop(0, spec.pool[0]);
    pool.addColorStop(0.55, spec.pool[1]);
    pool.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, w, h);
  }

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.mapping = EquirectangularReflectionMapping;
  return tex;
}

export function buildGemEnvironment(renderer: WebGLRenderer): Texture {
  const scene = new Scene();

  // Bright surround: this is the light that comes back out of the stone.
  const room = new Mesh(
    new BoxGeometry(40, 40, 40),
    new MeshBasicMaterial({ color: new Color("#ffffff").multiplyScalar(1.15), side: BackSide }),
  );
  scene.add(room);

  // Hard dark bars. Without these the stone is evenly bright and reads as
  // frosted glass; the CONTRAST between facets is what the eye calls sparkle.
  // Many NARROW bars, not a few wide ones. Wide bars are larger than a facet's
  // reflected solid angle, so whole facets come out flat white or flat black and
  // the stone reads as a poster. Thin bars put several light/dark transitions
  // inside each facet, which is what reads as cut rather than as paint.
  const BARS = 30;
  for (let i = 0; i < BARS; i++) {
    const a = (i / BARS) * Math.PI * 2;
    for (const y of [6, -6]) {
      const bar = new Mesh(
        new PlaneGeometry(1.1, 15),
        new MeshBasicMaterial({ color: new Color("#050506") }),
      );
      bar.position.set(Math.sin(a) * 17, y + (i % 2 ? 2 : -2), Math.cos(a) * 17);
      bar.lookAt(0, bar.position.y, 0);
      scene.add(bar);
    }
  }
  // Horizontal banding too, so facets tipped up or down also see a transition.
  for (const y of [12, 0, -12]) {
    const ring = new Mesh(
      new PlaneGeometry(38, 1.4),
      new MeshBasicMaterial({ color: new Color("#050506"), side: BackSide }),
    );
    ring.position.set(0, y, -19);
    scene.add(ring);
  }

  // A handful of very bright points for the individual flashes.
  for (const [x, y, z, size] of [
    [-8, 15, 8, 2.6], [9, 15, 4, 2.2], [0, 16, -9, 2.0], [13, 12, 9, 1.8],
    [-15, -3, 9, 2.4], [15, 4, -7, 2.4], [4, -15, 7, 2.2], [-12, 6, -12, 2.0],
    [-6, -13, -9, 1.8], [7, 2, 17, 2.2],
  ]) {
    const spot = new Mesh(
      new PlaneGeometry(size, size),
      new MeshBasicMaterial({ color: new Color("#ffffff").multiplyScalar(26) }),
    );
    spot.position.set(x, y, z);
    spot.lookAt(0, 0, 0);
    scene.add(spot);
  }

  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.006);
  pmrem.dispose();
  scene.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      (o.material as MeshBasicMaterial).dispose();
    }
  });
  return target.texture;
}

export function buildStudioEnvironment(renderer: WebGLRenderer): Texture {
  const scene = new Scene();

  // The surround. BackSide so we are inside the box looking at its walls.
  const room = new Mesh(
    new BoxGeometry(40, 30, 40),
    new MeshBasicMaterial({ color: new Color("#4a4b52"), side: BackSide }),
  );
  scene.add(room);

  for (const p of PANELS) {
    const mat = new MeshBasicMaterial({ color: new Color(p.color).multiplyScalar(p.intensity) });
    const mesh = new Mesh(new PlaneGeometry(p.size[0], p.size[1]), mat);
    mesh.position.set(...p.position);
    mesh.rotation.set(...p.rotation);
    scene.add(mesh);
  }

  const pmrem = new PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, BLUR);
  pmrem.dispose();

  room.geometry.dispose();
  scene.traverse((o) => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      (o.material as MeshBasicMaterial).dispose();
    }
  });

  return target.texture;
}
