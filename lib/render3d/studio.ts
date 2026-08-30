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
  { size: [26, 26], position: [0, 11, 0], rotation: [-Math.PI / 2, 0, 0], color: "#ffffff", intensity: 3.4 },
  // Front fill, so the surface facing the camera is not reading the dark wall.
  { size: [20, 14], position: [0, 1, 14], rotation: [0, 0, 0], color: "#eaf0ff", intensity: 1.5 },
  // Left and right verticals: these draw the long specular streaks down the band.
  { size: [10, 16], position: [-13, 1, 2], rotation: [0, Math.PI / 2, 0], color: "#ffffff", intensity: 2.4 },
  { size: [10, 16], position: [13, 1, -2], rotation: [0, -Math.PI / 2, 0], color: "#fff2df", intensity: 3.0 },
  // Floor bounce, so the pavilion has something to return and the underside of
  // the band is not a dead black edge.
  { size: [22, 22], position: [0, -10, 0], rotation: [Math.PI / 2, 0, 0], color: "#ffffff", intensity: 1.1 },
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
 * A backdrop plane, and the reason it is not optional.
 *
 * three's `transmission` is screen-space: it refracts what is actually RENDERED
 * behind the object. With an empty background there is nothing behind the stone
 * to bend, so the gem samples black and reads as a dark pebble no matter how
 * good its ior and dispersion are. Real jewellery photography has the same
 * constraint — nobody shoots a diamond against a void — and the fix is the same
 * one a photographer uses: put a lit surface behind it.
 */
export function buildBackdropTexture(): CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const g = ctx.createRadialGradient(size / 2, size * 0.42, size * 0.04, size / 2, size * 0.42, size * 0.62);
  g.addColorStop(0, "#8d8377");
  g.addColorStop(0.45, "#4a443d");
  g.addColorStop(1, "#141312");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/**
 * A SECOND environment, for the stones only.
 *
 * Metal and gems want opposite light. Metal is a mirror of a whole hemisphere,
 * so it wants a dark surround with a few big sources — that is what gives it
 * shape and a bright edge. A gem is 57 small mirrors pointing every which way,
 * so it wants the opposite: a BRIGHT surround, cut up by hard dark bars, so
 * that neighbouring facets land on wildly different values and the stone reads
 * as a mosaic of light and dark rather than as one tinted shape.
 *
 * A real studio solves this by lighting the stone separately from the setting.
 * three has no light-linking, but `material.envMap` overrides `scene.environment`
 * per material, which comes to the same thing for two pounds of code.
 */
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
    new MeshBasicMaterial({ color: new Color("#2b2c31"), side: BackSide }),
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
