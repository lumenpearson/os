/**
 * The screensavers the shell can draw.
 *
 * The catalogue lives here, next to the wallpapers, so Settings can offer
 * them without knowing how any of them is drawn: it reads the name and the
 * line of description, and the shell reads the id.
 */

export type ScreensaverId = 'none' | 'clock' | 'drift' | 'starfield' | 'contour' | 'rings';

export interface ScreensaverPreset {
  id: ScreensaverId;
  name: string;
  /** One line, shown under the setting once it is chosen. */
  description: string;
}

export const SCREENSAVERS: readonly ScreensaverPreset[] = [
  { id: 'none', name: 'None', description: 'The screen is left as it is.' },
  { id: 'clock', name: 'Clock', description: 'The time, moving slowly so it cannot burn in.' },
  { id: 'drift', name: 'Drift', description: 'Hairline squares turning about the centre.' },
  { id: 'starfield', name: 'Starfield', description: 'Points passing the screen.' },
  { id: 'contour', name: 'Contour', description: 'Contour lines easing over the same ground.' },
  { id: 'rings', name: 'Rings', description: 'Circles opening from the middle and fading.' },
];

export function screensaverById(id: string): ScreensaverPreset | undefined {
  return SCREENSAVERS.find((preset) => preset.id === id);
}
