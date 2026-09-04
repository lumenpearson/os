import { useWindowStore } from '@lumen/kernel';
import { useWindows } from '@lumen/kernel/react';
import { cx } from '@lumen/ui';
import { useShellStore } from '../shellStore';
import { SnapPreview } from './SnapPreview';
import { WindowFrame } from './WindowFrame';

/** Renders every window in z-order. The layer itself never re-renders on drag. */
export function WindowLayer() {
  const windows = useWindows();
  const interacting = useShellStore((s) => s.interacting);
  return (
    <div
      className={cx('absolute inset-0', interacting && '[&_iframe]:pointer-events-none')}
      data-testid="window-layer"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) useWindowStore.getState().focus(null);
      }}
    >
      {windows.map((w) => (
        <WindowFrame key={w.id} id={w.id} />
      ))}
      <SnapPreview />
    </div>
  );
}
