import { useSessionStore, useSettingsStore } from '@lumen/kernel';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreensaverLayer } from './ScreensaverLayer';

function saver(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="screensaver"]');
}

beforeEach(() => {
  useSettingsStore.getState().reset();
  useSessionStore.getState().setScreensaver(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  useSessionStore.getState().setScreensaver(false);
});

describe('ScreensaverLayer', () => {
  it('stays out of the way until the session goes idle', () => {
    render(<ScreensaverLayer />);
    expect(saver()).toBeNull();
  });

  it('draws nothing when the screensaver is set to none', () => {
    useSettingsStore.getState().patch('lock', { screensaver: 'none' });
    useSessionStore.getState().setScreensaver(true);
    render(<ScreensaverLayer />);
    expect(saver()).toBeNull();
  });

  it('draws the saver the settings name', () => {
    useSettingsStore.getState().patch('lock', { screensaver: 'rings' });
    useSessionStore.getState().setScreensaver(true);
    render(<ScreensaverLayer />);
    expect(saver()?.dataset.saver).toBe('rings');
    // It is decoration over the session, not something to read or reach.
    expect(saver()?.getAttribute('aria-hidden')).toBe('true');
  });

  it('animates when motion is welcome', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    useSettingsStore.getState().patch('lock', { screensaver: 'clock' });
    useSessionStore.getState().setScreensaver(true);
    render(<ScreensaverLayer />);
    expect(raf).toHaveBeenCalled();
  });

  it('holds still for someone who asked for less motion', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    useSettingsStore.getState().patch('appearance', { reduceMotion: true });
    useSettingsStore.getState().patch('lock', { screensaver: 'clock' });
    useSessionStore.getState().setScreensaver(true);
    render(<ScreensaverLayer />);
    expect(saver()).not.toBeNull();
    expect(raf).not.toHaveBeenCalled();
  });
});
