import {
  chromeTintValue,
  defaultSettings,
  presetTint,
  useSettingsStore,
  wallpaperById,
} from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useDynamicChrome } from './useDynamicChrome';

/** The hook reaches the kernel for one thing: an object URL for a user's image. */
const kernel = {
  vfs: { objectUrl: async () => 'blob:nothing' },
} as unknown as Parameters<typeof KernelProvider>[0]['kernel'];

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <KernelProvider kernel={kernel}>{children}</KernelProvider>
);

const chrome = () => document.documentElement.style.getPropertyValue('--lumen-chrome');

beforeEach(() => {
  useSettingsStore.setState({ settings: defaultSettings() });
  document.documentElement.style.removeProperty('--lumen-chrome');
});

afterEach(() => {
  document.documentElement.style.removeProperty('--lumen-chrome');
});

describe('useDynamicChrome', () => {
  it('tints the panels with the wallpaper the desktop is showing', () => {
    renderHook(() => useDynamicChrome(), { wrapper });
    const dawn = wallpaperById('preset:dawn');
    if (!dawn) throw new Error('preset:dawn is missing');
    expect(chrome()).toBe(chromeTintValue(presetTint(dawn) as never));
  });

  it('follows the wallpaper when it changes', () => {
    const { rerender } = renderHook(() => useDynamicChrome(), { wrapper });
    const dawn = chrome();
    useSettingsStore.getState().patch('desktop', { wallpaper: 'preset:paper' });
    rerender();
    expect(chrome()).not.toBe(dawn);
  });

  it('leaves the token to the theme when the setting is off', () => {
    useSettingsStore.getState().patch('desktop', { dynamicChrome: false });
    renderHook(() => useDynamicChrome(), { wrapper });
    expect(chrome()).toBe('');
  });

  it('gives the token back when the setting is turned off again', () => {
    const { rerender } = renderHook(() => useDynamicChrome(), { wrapper });
    expect(chrome()).not.toBe('');
    useSettingsStore.getState().patch('desktop', { dynamicChrome: false });
    rerender();
    expect(chrome()).toBe('');
  });

  it('gives the token back when the desktop goes away', () => {
    const { unmount } = renderHook(() => useDynamicChrome(), { wrapper });
    expect(chrome()).not.toBe('');
    unmount();
    expect(chrome()).toBe('');
  });
});
