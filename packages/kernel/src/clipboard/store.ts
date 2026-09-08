import { create } from 'zustand';
import type { ClipboardItem } from '../types';

interface ClipboardStore {
  item: ClipboardItem | null;
  history: ClipboardItem[];
  copyText: (text: string) => void;
  copyFiles: (paths: string[], operation: 'copy' | 'cut') => void;
  clear: () => void;
}

/**
 * The OS clipboard. Text is mirrored to the host clipboard when the browser
 * allows it; file operations stay internal because they reference VFS paths.
 */
export const useClipboardStore = create<ClipboardStore>((set) => ({
  item: null,
  history: [],
  copyText: (text) => {
    const item: ClipboardItem = { kind: 'text', text, copiedAt: Date.now() };
    set((s) => ({ item, history: [item, ...s.history].slice(0, 25) }));
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  },
  copyFiles: (paths, operation) => {
    const item: ClipboardItem = {
      kind: 'files',
      files: { paths, operation },
      copiedAt: Date.now(),
    };
    set((s) => ({ item, history: [item, ...s.history].slice(0, 25) }));
  },
  clear: () => set({ item: null }),
}));
