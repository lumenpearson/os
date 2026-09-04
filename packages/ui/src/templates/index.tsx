import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { cx } from '../cx';

export interface SplitPaneProps {
  /** Left/top pane. */
  first: ReactNode;
  /** Right/bottom pane. */
  second: ReactNode;
  direction?: 'horizontal' | 'vertical';
  initial?: number;
  min?: number;
  max?: number;
  /** Persist across renders under this key (sessionStorage). */
  storageKey?: string;
  className?: string;
  /** Collapse the first pane entirely (small screens). */
  collapsed?: boolean;
}

/** Two panes with a draggable, keyboard-adjustable divider. Drag writes via rAF, not state. */
export function SplitPane({
  first,
  second,
  direction = 'horizontal',
  initial = 220,
  min = 140,
  max = 480,
  storageKey,
  className,
  collapsed,
}: SplitPaneProps) {
  const [size, setSize] = useState(() => {
    if (storageKey) {
      try {
        const v = Number(sessionStorage.getItem(`lumen.split.${storageKey}`));
        if (v >= min && v <= max) return v;
      } catch {
        /* ignore */
      }
    }
    return initial;
  });
  const firstRef = useRef<HTMLDivElement>(null);
  const horizontal = direction === 'horizontal';

  useEffect(() => {
    if (storageKey) {
      try {
        sessionStorage.setItem(`lumen.split.${storageKey}`, String(size));
      } catch {
        /* ignore */
      }
    }
  }, [size, storageKey]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const start = horizontal ? e.clientX : e.clientY;
      const startSize = size;
      let latest = startSize;
      let raf = 0;
      const el = firstRef.current;
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      const onMove = (ev: PointerEvent) => {
        const delta = (horizontal ? ev.clientX : ev.clientY) - start;
        latest = Math.max(min, Math.min(max, startSize + delta));
        if (!raf) {
          raf = requestAnimationFrame(() => {
            raf = 0;
            if (el) el.style[horizontal ? 'width' : 'height'] = `${latest}px`;
          });
        }
      };
      const onUp = () => {
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
        target.removeEventListener('pointercancel', onUp);
        if (raf) cancelAnimationFrame(raf);
        setSize(latest);
      };
      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
      target.addEventListener('pointercancel', onUp);
    },
    [horizontal, size, min, max],
  );

  return (
    <div
      className={cx(
        'flex h-full min-h-0 w-full min-w-0',
        horizontal ? 'flex-row' : 'flex-col',
        className,
      )}
    >
      {!collapsed && (
        <div
          ref={firstRef}
          className="shrink-0 overflow-hidden"
          style={horizontal ? { width: size } : { height: size }}
        >
          {first}
        </div>
      )}
      {!collapsed && (
        <div
          role="separator"
          aria-orientation={horizontal ? 'vertical' : 'horizontal'}
          aria-valuenow={size}
          aria-valuemin={min}
          aria-valuemax={max}
          tabIndex={0}
          data-cursor={horizontal ? 'col-resize' : 'row-resize'}
          onPointerDown={onPointerDown}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 40 : 10;
            if ((horizontal && e.key === 'ArrowLeft') || (!horizontal && e.key === 'ArrowUp'))
              setSize((s) => Math.max(min, s - step));
            if ((horizontal && e.key === 'ArrowRight') || (!horizontal && e.key === 'ArrowDown'))
              setSize((s) => Math.min(max, s + step));
          }}
          className={cx(
            'group relative shrink-0 bg-rule lumen-focus',
            horizontal ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize',
            'after:absolute after:content-[""]',
            horizontal
              ? 'after:-left-1 after:-right-1 after:top-0 after:bottom-0'
              : 'after:-top-1 after:-bottom-1 after:left-0 after:right-0',
            'hover:bg-accent focus-visible:bg-accent transition-colors duration-(--duration-fast) delay-100',
          )}
        />
      )}
      <div className="min-h-0 min-w-0 flex-1">{second}</div>
    </div>
  );
}

export interface AppFrameProps {
  toolbar?: ReactNode;
  sidebar?: ReactNode;
  children: ReactNode;
  statusBar?: ReactNode;
  className?: string;
}

/** Toolbar on top, optional sidebar, content, optional status bar. The default app skeleton. */
export function AppFrame({ toolbar, sidebar, children, statusBar, className }: AppFrameProps) {
  return (
    <div className={cx('flex h-full min-h-0 w-full flex-col bg-surface text-ink', className)}>
      {toolbar}
      <div className="flex min-h-0 flex-1">
        {sidebar}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      </div>
      {statusBar && (
        <div className="mono flex h-6 shrink-0 items-center gap-3 border-t border-rule bg-canvas px-3 text-xs text-ink-2">
          {statusBar}
        </div>
      )}
    </div>
  );
}

export interface SettingsPageProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/** A settings page: a title, an optional one-line description, then groups. */
export function SettingsPage({ title, description, children, className }: SettingsPageProps) {
  return (
    <div className={cx('lumen-scroll h-full', className)}>
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-8 py-7">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="text-base text-ink-2">{description}</p>}
        </header>
        {children}
      </div>
    </div>
  );
}

export interface SettingsGroupProps {
  title?: string;
  children: ReactNode;
  description?: string;
}

/** A bordered group of rows. Related rows sit tight; groups sit far apart. */
export function SettingsGroup({ title, description, children }: SettingsGroupProps) {
  return (
    <section className="flex flex-col gap-2">
      {title && (
        <div className="flex flex-col gap-0.5 px-1">
          <h2 className="text-md font-medium text-ink">{title}</h2>
          {description && <p className="text-sm text-ink-2">{description}</p>}
        </div>
      )}
      <div className="divide-y divide-rule rounded-md border border-rule bg-surface">
        {children}
      </div>
    </section>
  );
}

export interface SettingsRowProps {
  label: string;
  description?: string;
  children?: ReactNode;
  /** Stack the control under the label (sliders, long selects). */
  stacked?: boolean;
  htmlFor?: string;
}

export function SettingsRow({ label, description, children, stacked, htmlFor }: SettingsRowProps) {
  return (
    <div
      className={cx(
        'flex gap-4 px-4 py-2.5',
        stacked ? 'flex-col' : 'items-center justify-between',
      )}
    >
      <div className="flex min-w-0 flex-col">
        <label htmlFor={htmlFor} className="text-base text-ink">
          {label}
        </label>
        {description && <span className="text-sm text-ink-2">{description}</span>}
      </div>
      {children && (
        <div className={cx('flex shrink-0 items-center gap-2', stacked && 'w-full')}>
          {children}
        </div>
      )}
    </div>
  );
}
