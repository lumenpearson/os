/**
 * The hero composition: six windows in a shallow stack. Units are scene units;
 * the camera sits at z = 8 with a 30° field of view, so about 4.3 units of
 * height are visible at z = 0.
 */
export interface WindowSpec {
  /** Body width and height. */
  size: readonly [number, number];
  /** Resting position; z orders the stack (larger is nearer). */
  position: readonly [number, number, number];
  /** Fraction of the body width each content line spans, top to bottom. */
  lines: readonly number[];
  /** Whether the window shows a sidebar column on the left. */
  sidebar: boolean;
  /** Index of a content line drawn as selected (the one use of the accent). */
  selection?: number;
  /** Phase offset so the windows do not drift in unison. */
  phase: number;
  /** Peak drift distance. */
  amplitude: number;
}

export const TITLE_BAR_HEIGHT = 0.2;
export const CORNER_RADIUS = 0.08;

export const windows: readonly WindowSpec[] = [
  {
    size: [2.6, 1.7],
    position: [0.2, -0.1, 0.4],
    lines: [0.62, 0.48, 0.55, 0.3],
    sidebar: true,
    selection: 1,
    phase: 0.0,
    amplitude: 0.03,
  },
  {
    size: [1.9, 1.25],
    position: [-1.9, 0.75, -0.2],
    lines: [0.7, 0.55, 0.4],
    sidebar: false,
    phase: 1.3,
    amplitude: 0.045,
  },
  {
    size: [1.7, 1.15],
    position: [2.2, 0.85, -0.6],
    lines: [0.5, 0.65, 0.35],
    sidebar: false,
    phase: 2.6,
    amplitude: 0.05,
  },
  {
    size: [2.1, 1.3],
    position: [-1.6, -1.05, -0.9],
    lines: [0.6, 0.4],
    sidebar: true,
    phase: 3.9,
    amplitude: 0.055,
  },
  {
    size: [1.5, 1.0],
    position: [2.0, -1.0, -1.3],
    lines: [0.45, 0.6],
    sidebar: false,
    phase: 5.2,
    amplitude: 0.06,
  },
  {
    size: [1.3, 0.85],
    position: [0.1, 1.45, -1.7],
    lines: [0.55, 0.35],
    sidebar: false,
    phase: 0.7,
    amplitude: 0.065,
  },
];

/** Slow drift for one window at time `t` (seconds); bounded by its amplitude. */
export function drift(t: number, spec: Pick<WindowSpec, 'phase' | 'amplitude'>): [number, number] {
  return [
    Math.sin(t * 0.32 + spec.phase) * spec.amplitude,
    Math.cos(t * 0.24 + spec.phase * 1.7) * spec.amplitude,
  ];
}

/** Group rotation (radians) for a pointer in normalised device coordinates. */
export function parallax(pointer: { x: number; y: number }): { x: number; y: number } {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return { x: 0 - clamp(pointer.y) * 0.07, y: clamp(pointer.x) * 0.11 };
}

/** Frame-rate independent interpolation factor for a 1/`halfLife`-second response. */
export function damp(current: number, target: number, halfLife: number, dt: number): number {
  const k = 1 - 2 ** (-dt / halfLife);
  return current + (target - current) * k;
}
