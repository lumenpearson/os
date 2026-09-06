/**
 * The taskbar.
 *
 * What it carries, and in what order, is `taskbar.items` — each id in that
 * list is a piece under `items/`. Where it sits, how big its icons are,
 * whether it hides, magnifies or floats free of the edge all come from
 * Settings > Taskbar; this file is the frame those pieces sit in.
 *
 * Floating keeps its whole footprint inside the band the shell reserves for
 * the bar (`--lumen-taskbar-h`, which is the icon size plus 12): the pill is
 * inset by half the room left over, so a detached bar never covers the bottom
 * of a maximised window. On a scaled display the reserved band grows and the
 * gap grows with it.
 */

import { useProcessStore, useWindowStore } from '@lumen/kernel';
import { useRuntimeSettings } from '@lumen/kernel/react';
import { cx, Tooltip, useMediaQuery } from '@lumen/ui';
import { type CSSProperties, useMemo, useRef, useState } from 'react';
import { useEdgeReveal } from '../hooks/useEdgeReveal';
import { useImmersive } from '../hooks/useImmersive';
import { useShellStore } from '../shellStore';
import {
  ClockItem,
  FrequentItems,
  NoSourceItem,
  PinnedItems,
  SearchItem,
  StartItem,
  type TaskbarItemProps,
  TrashItem,
  tooltipSide,
  WindowsItems,
} from './items';
import { resolveItems } from './logic';
import { useMagnify } from './useMagnify';

/**
 * Padding inside a floating bar, in px: the pill is this much taller than an
 * icon, and the rest of the reserved band becomes the margin around it.
 * Tailwind needs the class spelled out, so `p-[3px]` below has to agree.
 */
const FLOAT_PADDING = 3;

export function Taskbar() {
  const settings = useRuntimeSettings();
  const taskbar = settings.taskbar;
  const startOpen = useShellStore((s) => s.startMenu);
  const [revealed, setRevealed] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => resolveItems(taskbar.items), [taskbar.items]);
  const { position, size, floating, centered, autoHide } = taskbar;
  const vertical = position === 'left' || position === 'right';

  const systemReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const magnifier = useMagnify(rowRef, {
    // Magnification is motion driven by the pointer: someone who has asked for
    // less of it has asked for none of this.
    enabled: taskbar.magnify && !settings.appearance.reduceMotion && !systemReducedMotion,
    vertical,
    size,
  });

  const hidden = autoHide && !revealed && !startOpen;
  // Full screen slides it away as well; the edge it left from brings it back.
  const immersive = useImmersive().taskbar;
  const edgeRevealed = useEdgeReveal(position === 'bottom' ? 'bottom' : position, immersive);
  const immersiveHidden = immersive && !edgeRevealed && !revealed && !startOpen;
  const away = hidden || immersiveHidden;

  const inset = `calc((var(--lumen-taskbar-h) - ${size + FLOAT_PADDING * 2}px) / 2)`;
  const floatStyle: CSSProperties = !floating
    ? {}
    : position === 'bottom'
      ? { bottom: inset, ...(centered ? {} : { left: inset }) }
      : position === 'left'
        ? { left: inset, ...(centered ? {} : { top: `calc(var(--lumen-menubar-h) + ${inset})` }) }
        : { right: inset, ...(centered ? {} : { top: `calc(var(--lumen-menubar-h) + ${inset})` }) };

  const common: TaskbarItemProps = {
    size,
    vertical,
    position,
    showLabels: taskbar.showLabels,
  };

  return (
    <>
      {autoHide && (
        <div
          aria-hidden
          className={cx(
            'absolute z-[999]',
            vertical ? 'top-0 bottom-0 w-1.5' : 'left-0 right-0 h-1.5',
            position === 'bottom' && 'bottom-0',
            position === 'left' && 'left-0',
            position === 'right' && 'right-0',
          )}
          onPointerEnter={() => setRevealed(true)}
        />
      )}
      <nav
        aria-label="Taskbar"
        data-testid="taskbar"
        data-position={position}
        data-floating={floating}
        style={floatStyle}
        onPointerEnter={() => {
          if (hideTimer.current) clearTimeout(hideTimer.current);
          setRevealed(true);
        }}
        onPointerLeave={() => {
          if (!autoHide) return;
          hideTimer.current = setTimeout(() => setRevealed(false), 400);
        }}
        className={cx(
          'absolute z-[1000] flex items-center bg-chrome text-ink select-none',
          !settings.appearance.reduceTransparency && 'surface-blur',
          'transition-transform duration-(--duration-base) ease-(--ease-standard)',
          vertical ? 'flex-col' : 'flex-row',
          floating && 'rounded-lg border border-rule shadow-md',
          floating &&
            centered &&
            (vertical ? 'top-1/2 -translate-y-1/2' : 'left-1/2 -translate-x-1/2'),
          !floating &&
            (vertical
              ? 'top-(--lumen-menubar-h) bottom-0 w-(--lumen-taskbar-h) border-rule'
              : 'inset-x-0 bottom-0 h-(--lumen-taskbar-h) border-t border-rule'),
          !floating && position === 'left' && 'left-0 border-r',
          !floating && position === 'right' && 'right-0 border-l',
          away && hideTransform(position, floating),
        )}
      >
        <div
          ref={rowRef}
          data-testid="taskbar-row"
          className={cx(
            // Tight inside a piece (see `groupClass`), looser between them.
            'flex items-center gap-2',
            vertical ? 'flex-col' : 'flex-row',
            floating ? 'p-[3px]' : 'p-1.5',
            !floating && centered && !vertical && 'mx-auto',
          )}
          onPointerMove={magnifier.onPointerMove}
          onPointerLeave={magnifier.onPointerLeave}
        >
          {items.map((id, index) => {
            switch (id) {
              case 'start':
                return <StartItem key={id} {...common} separator={index < items.length - 1} />;
              case 'search':
                return <SearchItem key={id} {...common} />;
              case 'pinned':
                return <PinnedItems key={id} {...common} />;
              case 'windows':
                return <WindowsItems key={id} {...common} />;
              case 'frequent':
                return <FrequentItems key={id} {...common} />;
              case 'trash':
                return <TrashItem key={id} {...common} />;
              case 'clock':
                return <ClockItem key={id} {...common} />;
              case 'weather':
              case 'news':
                return <NoSourceItem key={id} id={id} {...common} />;
              default:
                return null;
            }
          })}
        </div>
        {!floating && !centered && <div className="flex-1" />}
        <ShowDesktop
          vertical={vertical}
          floating={floating}
          centered={centered}
          position={position}
        />
      </nav>
    </>
  );
}

function hideTransform(position: TaskbarItemProps['position'], floating: boolean): string {
  // A floating bar has to clear its own margin as well as its own height.
  if (!floating)
    return position === 'bottom'
      ? 'translate-y-full'
      : position === 'left'
        ? '-translate-x-full'
        : 'translate-x-full';
  return position === 'bottom'
    ? 'translate-y-[calc(100%+var(--lumen-taskbar-h))]'
    : position === 'left'
      ? '-translate-x-[calc(100%+var(--lumen-taskbar-h))]'
      : 'translate-x-[calc(100%+var(--lumen-taskbar-h))]';
}

/**
 * The strip at the far end. It carries no glyph: at the 12px this corner
 * allows, any icon with internal detail turns to mush. The hairline is the
 * affordance — the name lives in the tooltip and the aria-label.
 */
function ShowDesktop({
  vertical,
  floating,
  centered,
  position,
}: Pick<TaskbarItemProps, 'vertical' | 'position'> & { floating: boolean; centered: boolean }) {
  return (
    <Tooltip content="Show desktop" side={tooltipSide(position)}>
      <button
        type="button"
        aria-label="Show desktop"
        data-testid="taskbar-show-desktop"
        onClick={() => {
          const s = useWindowStore.getState();
          if (s.order.some((id) => !s.windows[id]?.minimized)) s.minimizeAll();
          else s.restoreAll();
        }}
        className={cx(
          'lumen-focus hover:bg-ink/8 dark:hover:bg-white/8',
          'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
          vertical ? 'h-4 border-t border-rule' : 'w-3 border-l border-rule',
          // A floating bar is only as tall as its contents, so the strip takes
          // its height from the flex line rather than from a percentage of it.
          floating && 'self-stretch',
          floating && (vertical ? 'rounded-b-lg' : 'rounded-r-lg'),
          !floating && (vertical ? 'mb-1 w-full' : 'ml-auto h-full'),
          !floating && centered && !vertical && 'absolute right-0 top-0',
        )}
      />
    </Tooltip>
  );
}

export function useRunningApps() {
  const processes = useProcessStore((s) => s.processes);
  return useMemo(() => new Set(Object.values(processes).map((p) => p.appId)), [processes]);
}
