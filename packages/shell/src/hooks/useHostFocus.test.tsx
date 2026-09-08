import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useShellStore } from '../shellStore';
import { useHostFocus } from './useHostFocus';

afterEach(() => {
  vi.restoreAllMocks();
  useShellStore.getState().setHostFocused(true);
});

describe('useHostFocus', () => {
  it('follows the tab losing and regaining the keyboard', () => {
    renderHook(() => useHostFocus());
    expect(useShellStore.getState().hostFocused).toBe(true);

    act(() => window.dispatchEvent(new Event('blur')));
    expect(useShellStore.getState().hostFocused).toBe(false);

    act(() => window.dispatchEvent(new Event('focus')));
    expect(useShellStore.getState().hostFocused).toBe(true);
  });

  it('treats a hidden tab as unfocused, whatever the window says', () => {
    renderHook(() => useHostFocus());
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(useShellStore.getState().hostFocused).toBe(false);
  });

  it('leaves the shell focused when it stops watching', () => {
    const { unmount } = renderHook(() => useHostFocus());
    act(() => window.dispatchEvent(new Event('blur')));
    expect(useShellStore.getState().hostFocused).toBe(false);
    unmount();
    expect(useShellStore.getState().hostFocused).toBe(true);
  });
});
