import type { Rect } from '@lumen/kernel';
import { create } from 'zustand';

interface SnapPreviewStore {
  rect: Rect | null;
  set: (rect: Rect | null) => void;
}

/** The translucent rectangle shown while a dragged window is near a snap zone. */
export const useSnapPreview = create<SnapPreviewStore>((set) => ({
  rect: null,
  set: (rect) => set({ rect }),
}));

export function SnapPreview() {
  const rect = useSnapPreview((s) => s.rect);
  if (!rect) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-[899] rounded-lg border border-accent bg-accent/15 transition-[left,top,width,height] duration-(--duration-fast) ease-(--ease-standard)"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
    />
  );
}
