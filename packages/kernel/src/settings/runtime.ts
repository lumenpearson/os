/**
 * Low Power Mode, as an override rather than an edit.
 *
 * Settings > Power turns it on; the system then runs with the expensive parts
 * of the interface switched off. It must not write those choices into the
 * stored settings: someone who turns low power on and off again is entitled
 * to find their shadows and their blur exactly as they left them, and a
 * switch in Settings that moves on its own is a switch nobody can trust. So
 * the stored settings stay as they are and everything that draws asks for the
 * runtime ones instead.
 */

import type { Settings } from './schema';

/**
 * The settings as the machine should run them. Identical to what was stored
 * unless Low Power Mode is on, in which case motion, transparency, window
 * shadows and taskbar magnification are off — the four that cost a
 * composite, a blur pass or an animation frame and buy nothing but polish.
 */
export function runtimeSettings(settings: Settings): Settings {
  if (!settings.power.lowPowerMode) return settings;
  return {
    ...settings,
    appearance: { ...settings.appearance, reduceMotion: true, reduceTransparency: true },
    display: { ...settings.display, shadows: false },
    taskbar: { ...settings.taskbar, magnify: false },
  };
}

/** Whether a setting is being overridden right now, for the UI to say so. */
export function isOverriddenByLowPower(settings: Settings, id: LowPowerOverride): boolean {
  return settings.power.lowPowerMode && LOW_POWER_OVERRIDES.includes(id);
}

export const LOW_POWER_OVERRIDES = [
  'appearance.reduceMotion',
  'appearance.reduceTransparency',
  'display.shadows',
  'taskbar.magnify',
] as const;

export type LowPowerOverride = (typeof LOW_POWER_OVERRIDES)[number];
