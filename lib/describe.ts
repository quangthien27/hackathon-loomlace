/**
 * The design in words.
 *
 * Used as the accessible description of whichever canvas is mounted. A WebGL
 * canvas is a single opaque element to a screen reader — there is no DOM inside
 * it to read — so without this the 3D route would be an unlabelled blank to
 * anyone not looking at it. The SVG route has the same problem for the same
 * reason, so the sentence lives here rather than in either renderer.
 */

import { SETTING_WORD, type DesignState, type Stone } from "./design";
import { METAL } from "./render/materials";

export function describeDesign(d: DesignState): string {
  const stones = d.stones
    .map((s: Stone) => `${s.sizeMm.toFixed(1)}mm ${s.cut} cut ${s.type}`)
    .join(", ");
  return (
    `A ${d.band.widthMm.toFixed(1)}mm ${d.band.profile} ${METAL[d.band.metal].label} ring ` +
    `in a ${SETTING_WORD[d.setting]} setting` +
    (stones ? `, set with ${stones}` : "") +
    (d.engraving ? `, engraved "${d.engraving.text}" on the ${d.engraving.placement}` : "") +
    `. Viewed from the ${d.view}.`
  );
}
