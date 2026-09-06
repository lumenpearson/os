import { describe, expect, it } from 'vitest';
import { isOverriddenByLowPower, LOW_POWER_OVERRIDES, runtimeSettings } from './runtime';
import { defaultSettings } from './schema';

describe('runtimeSettings', () => {
  it('hands back the same object when low power is off', () => {
    const settings = defaultSettings();
    expect(runtimeSettings(settings)).toBe(settings);
  });

  it('turns off the four expensive parts of the interface', () => {
    const stored = defaultSettings();
    stored.appearance.reduceMotion = false;
    stored.appearance.reduceTransparency = false;
    stored.display.shadows = true;
    stored.taskbar.magnify = true;
    stored.power.lowPowerMode = true;
    const run = runtimeSettings(stored);
    expect(run.appearance.reduceMotion).toBe(true);
    expect(run.appearance.reduceTransparency).toBe(true);
    expect(run.display.shadows).toBe(false);
    expect(run.taskbar.magnify).toBe(false);
  });

  it('leaves the stored settings untouched, so the switches keep their answers', () => {
    const stored = defaultSettings();
    stored.display.shadows = true;
    stored.power.lowPowerMode = true;
    runtimeSettings(stored);
    expect(stored.display.shadows).toBe(true);
    expect(stored.appearance.reduceTransparency).toBe(false);
  });

  it('changes nothing else', () => {
    const stored = defaultSettings();
    stored.power.lowPowerMode = true;
    const run = runtimeSettings(stored);
    expect(run.desktop).toBe(stored.desktop);
    expect(run.windows).toBe(stored.windows);
    expect(run.animation).toBe(stored.animation);
    expect(run.appearance.blur).toBe(stored.appearance.blur);
  });
});

describe('isOverriddenByLowPower', () => {
  it('is true only for the settings low power actually overrides', () => {
    const stored = defaultSettings();
    stored.power.lowPowerMode = true;
    for (const id of LOW_POWER_OVERRIDES) expect(isOverriddenByLowPower(stored, id)).toBe(true);
  });

  it('is false with low power off', () => {
    const stored = defaultSettings();
    for (const id of LOW_POWER_OVERRIDES) expect(isOverriddenByLowPower(stored, id)).toBe(false);
  });
});
