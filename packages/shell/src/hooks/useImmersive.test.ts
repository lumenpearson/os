import { defaultSettings, useSettingsStore, useWindowStore, type WindowState } from '@lumen/kernel';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useShellStore } from '../shellStore';
import { useImmersive } from './useImmersive';

function windowState(over: Partial<WindowState>): WindowState {
  return {
    id: 'w1',
    minimized: false,
    closing: false,
    fullscreen: false,
    ...over,
  } as unknown as WindowState;
}

function screenState(over: Partial<WindowState>) {
  useWindowStore.setState({ windows: { w1: windowState(over) }, order: ['w1'], focusedId: 'w1' });
}

beforeEach(() => {
  useSettingsStore.setState({ settings: defaultSettings() });
  useWindowStore.setState({ windows: {}, order: [], focusedId: null });
  useShellStore.setState({ missionControl: false });
});

describe('useImmersive', () => {
  it('leaves the panels alone with no full-screen window', () => {
    screenState({ fullscreen: false });
    expect(renderHook(() => useImmersive()).result.current).toEqual({
      systemBar: false,
      taskbar: false,
    });
  });

  it('slides both panels away for a full-screen window', () => {
    screenState({ fullscreen: true });
    expect(renderHook(() => useImmersive()).result.current).toEqual({
      systemBar: true,
      taskbar: true,
    });
  });

  it('answers each panel separately', () => {
    useSettingsStore.getState().patch('windows', { immersiveTaskbar: false });
    screenState({ fullscreen: true });
    expect(renderHook(() => useImmersive()).result.current).toEqual({
      systemBar: true,
      taskbar: false,
    });
  });

  it('keeps the panels when full screen stops at them: sliding off would uncover nothing', () => {
    useSettingsStore.getState().patch('windows', { fullscreenCoversPanels: false });
    screenState({ fullscreen: true });
    expect(renderHook(() => useImmersive()).result.current).toEqual({
      systemBar: false,
      taskbar: false,
    });
  });

  it('ignores a minimised full-screen window', () => {
    screenState({ fullscreen: true, minimized: true });
    expect(renderHook(() => useImmersive()).result.current.systemBar).toBe(false);
  });
});

describe('the window overview', () => {
  it('takes both panels away while it is open', () => {
    useShellStore.setState({ missionControl: true });
    screenState({ fullscreen: false });
    expect(renderHook(() => useImmersive()).result.current).toEqual({
      systemBar: true,
      taskbar: true,
    });
  });

  it('asks whatever Settings says, because the overview is not full screen', () => {
    useSettingsStore
      .getState()
      .patch('windows', { immersiveSystemBar: false, immersiveTaskbar: false });
    useShellStore.setState({ missionControl: true });
    screenState({ fullscreen: false });
    expect(renderHook(() => useImmersive()).result.current).toEqual({
      systemBar: true,
      taskbar: true,
    });
  });

  it('gives them back when it closes', () => {
    useShellStore.setState({ missionControl: true });
    screenState({ fullscreen: false });
    useShellStore.setState({ missionControl: false });
    expect(renderHook(() => useImmersive()).result.current).toEqual({
      systemBar: false,
      taskbar: false,
    });
  });
});
