/**
 * One app on the bar. Click launches, focuses or minimises; the context menu
 * opens from the pointer and from the keyboard (Menu, or Shift+F10). A dot
 * marks a running app, and takes the accent when that app is in front.
 */

import type { AppDefinition } from '@lumen/kernel';
import { AnchoredMenu, cx, type MenuEntry, Tooltip } from '@lumen/ui';
import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, useState } from 'react';
import { ITEM_BUTTON, type TaskbarItemProps, tooltipSide } from './types';

export interface AppButtonProps extends TaskbarItemProps {
  app: AppDefinition;
  running: boolean;
  active: boolean;
  onActivate: () => void;
  /** Built when the menu opens, so a closed menu costs nothing. */
  menuItems: () => MenuEntry[];
  onPointerDown?: (event: ReactPointerEvent) => void;
  /** The icon can be dragged along the bar to reorder it. */
  reorderable?: boolean;
}

export function AppButton({
  app,
  running,
  active,
  onActivate,
  menuItems,
  onPointerDown,
  reorderable = false,
  size,
  vertical,
  position,
  showLabels,
}: AppButtonProps) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const Icon = app.icon;
  const labelled = showLabels && !vertical;

  const openMenuFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
    event.preventDefault();
    const r = event.currentTarget.getBoundingClientRect();
    setAt({ x: r.left + r.width / 2, y: position === 'bottom' ? r.top : r.bottom });
  };

  return (
    <>
      <Tooltip content={app.name} side={tooltipSide(position)}>
        <button
          type="button"
          data-taskbar-icon=""
          data-testid={`taskbar-${app.id}`}
          aria-label={app.name}
          aria-pressed={active}
          aria-haspopup="menu"
          onClick={onActivate}
          onPointerDown={onPointerDown}
          onContextMenu={(e) => {
            e.preventDefault();
            setAt({ x: e.clientX, y: e.clientY });
          }}
          onKeyDown={openMenuFromKeyboard}
          className={cx(
            ITEM_BUTTON,
            active ? 'bg-surface-2' : 'hover:bg-surface-2/70',
            labelled && 'gap-2 px-2',
            reorderable && 'touch-none',
          )}
          style={{ minWidth: size, height: size }}
        >
          <span
            data-taskbar-glyph=""
            className={cx(
              'flex items-center justify-center',
              position === 'bottom' && 'origin-bottom',
              position === 'left' && 'origin-left',
              position === 'right' && 'origin-right',
            )}
          >
            <Icon size={Math.round(size * 0.62)} />
          </span>
          {labelled && <span className="max-w-24 truncate-1 text-sm">{app.name}</span>}
          {running && (
            <span
              aria-hidden
              data-testid={`taskbar-${app.id}-running`}
              className={cx(
                // deslop-ignore-next-line 19 — the running-app indicator is a 4px dot, flat and unanimated.
                'absolute rounded-full bg-ink-2',
                vertical
                  ? 'left-0.5 top-1/2 h-1 w-1 -translate-y-1/2'
                  : 'bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2',
                active && 'bg-accent',
              )}
            />
          )}
        </button>
      </Tooltip>
      <AnchoredMenu
        open={at !== null}
        onClose={() => setAt(null)}
        at={at}
        items={at ? menuItems() : []}
      />
    </>
  );
}
