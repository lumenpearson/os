/**
 * Dichromat simulation: what a colour becomes when one class of cone is
 * missing.
 *
 * The pipeline is the published one. Linear sRGB is taken into cone
 * excitations with the Smith–Pokorny based matrix tabulated by Viénot, Brettel
 * & Mollon, "Digital video colourmaps for checking the legibility of displays
 * by dichromats", Color Research & Application 24(4), 1999, pp. 243–252, and
 * brought back with that matrix's inverse from the same paper. Between the two
 * the excitation of the missing cone is replaced by the value the surviving
 * pair would have on the dichromat's reduced plane — one substitution per
 * deficiency, which is what makes each of these a single 3x3 matrix.
 *
 * The protanope and deuteranope planes are the 1999 paper's own. The tritanope
 * plane is the short-wavelength half-plane of the earlier Brettel, Viénot &
 * Mollon method (Journal of the Optical Society of America A 14(10), 1997,
 * pp. 2647–2655), whose full form uses two half-planes; reduced to one it holds
 * the short-wavelength half and is therefore approximate at the saturated end
 * of the other — a pure red comes out yellow rather than staying red. All
 * three preserve the white point and are idempotent, which is what a
 * projection onto a plane has to be and the check these constants pass.
 *
 * This is a simulation of a colorimetric model, not a report of anyone's
 * experience. The panel says so.
 */

import { clampChannel, clampUnit, type Rgba, rgba } from '../paint/colour';
import { linearToSrgb, srgbToLinear } from './model';

export type VisionType = 'protanopia' | 'deuteranopia' | 'tritanopia';

export const VISION_TYPES: ReadonlyArray<{ id: VisionType; label: string; cone: string }> = [
  { id: 'protanopia', label: 'Protanopia', cone: 'no long-wavelength cone' },
  { id: 'deuteranopia', label: 'Deuteranopia', cone: 'no medium-wavelength cone' },
  { id: 'tritanopia', label: 'Tritanopia', cone: 'no short-wavelength cone' },
];

/** Row-major 3x3. */
export type Matrix3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

type Triple = readonly [number, number, number];

/** Linear sRGB to LMS (Viénot, Brettel & Mollon 1999, Table 1). */
export const RGB_TO_LMS: Matrix3 = [
  17.8824, 43.5161, 4.11935, 3.45565, 27.1554, 3.86714, 0.0299566, 0.184309, 1.46709,
];

/** Its inverse, LMS back to linear sRGB. */
export const LMS_TO_RGB: Matrix3 = [
  0.0809444479, -0.130504409, 0.116721066, -0.0102485335, 0.0540193266, -0.113614708,
  -0.000365296938, -0.00412161469, 0.693511405,
];

/**
 * The substitutions. Each replaces the missing cone's excitation with a
 * combination of the two that remain; the other two rows are the identity.
 */
export const CONE_SUBSTITUTION: Readonly<Record<VisionType, Matrix3>> = {
  protanopia: [0, 2.02344, -2.52581, 0, 1, 0, 0, 0, 1],
  deuteranopia: [1, 0, 0, 0.494207, 0, 1.24827, 0, 0, 1],
  tritanopia: [1, 0, 0, 0, 1, 0, -0.395913, 0.801109, 0],
};

export function applyMatrix(matrix: Matrix3, vector: Triple): Triple {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const [x, y, z] = vector;
  return [a * x + b * y + c * z, d * x + e * y + f * z, g * x + h * y + i * z];
}

/**
 * The colour a dichromat's reduced gamut renders this one as. Alpha is carried
 * through untouched: transparency is not a cone response.
 */
export function simulate(colour: Rgba, type: VisionType): Rgba {
  const linear: Triple = [
    srgbToLinear(clampChannel(colour.r) / 255),
    srgbToLinear(clampChannel(colour.g) / 255),
    srgbToLinear(clampChannel(colour.b) / 255),
  ];
  const cones = applyMatrix(RGB_TO_LMS, linear);
  const reduced = applyMatrix(CONE_SUBSTITUTION[type], cones);
  const [r, g, b] = applyMatrix(LMS_TO_RGB, reduced);
  // The reduced plane leaves the display gamut for some inputs. Clipping is
  // what the paper does and what a screen would do anyway.
  return rgba(
    linearToSrgb(clampUnit(r)) * 255,
    linearToSrgb(clampUnit(g)) * 255,
    linearToSrgb(clampUnit(b)) * 255,
    clampChannel(colour.a),
  );
}
