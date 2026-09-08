/**
 * Whether the tab or desktop window Lumen runs inside has the keyboard.
 *
 * When it does not, the window in front should stop looking like the window in
 * front: its title bar goes quiet, its controls go grey. Typing would reach
 * whatever the person is actually working in, and a system that keeps its
 * front window lit while the keyboard is elsewhere reads as a web page.
 */

import { useEffect } from 'react';
import { useShellStore } from '../shellStore';

export function useHostFocus(): void {
  useEffect(() => {
    const set = (value: boolean) => useShellStore.getState().setHostFocused(value);
    const onFocus = () => set(true);
    const onBlur = () => set(false);
    // The document's visibility covers the tab being switched away from; blur
    // covers another window taking focus while this tab is still visible.
    const onVisibility = () => set(document.visibilityState === 'visible' && document.hasFocus());
    set(typeof document === 'undefined' || document.hasFocus());
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      set(true);
    };
  }, []);
}
