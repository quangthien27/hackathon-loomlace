/**
 * React 19 moved the JSX namespace under `React`, so R3F's intrinsic elements
 * (<mesh>, <meshPhysicalMaterial>, …) are no longer registered automatically.
 * Without this, every three.js element is a TS error even though it renders.
 */
import type { ThreeElements } from "@react-three/fiber";

declare module "react" {
  namespace JSX {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface IntrinsicElements extends ThreeElements {}
  }
}
