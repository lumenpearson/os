import {
  cloneElement,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../cx';
import { usePresence } from '../hooks';

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement<Record<string, unknown>>;
  side?: 'top' | 'bottom';
  delay?: number;
}

/** A quiet tooltip: appears after a short delay, follows the trigger, never animates scale. */
export function Tooltip({ content, children, side = 'bottom', delay = 500 }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  // A tooltip is a menu-weight thing: it belongs to the pointer, and the
  // Menus switch is what turns it off.
  const { mounted, leaving, anim } = usePresence(open, 'menu');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const id = useId();

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ x: r.left + r.width / 2, y: side === 'top' ? r.top - 6 : r.bottom + 6 });
      setOpen(true);
    }, delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const child = cloneElement(children, {
    ref: (el: HTMLElement | null) => {
      anchor.current = el;
    },
    'aria-describedby': open ? id : undefined,
    onPointerEnter: (e: PointerEvent) => {
      (children.props.onPointerEnter as ((e: PointerEvent) => void) | undefined)?.(e);
      show();
    },
    onPointerLeave: (e: PointerEvent) => {
      (children.props.onPointerLeave as ((e: PointerEvent) => void) | undefined)?.(e);
      hide();
    },
    onFocus: (e: FocusEvent) => {
      (children.props.onFocus as ((e: FocusEvent) => void) | undefined)?.(e);
      show();
    },
    onBlur: (e: FocusEvent) => {
      (children.props.onBlur as ((e: FocusEvent) => void) | undefined)?.(e);
      hide();
    },
    onPointerDown: (e: PointerEvent) => {
      (children.props.onPointerDown as ((e: PointerEvent) => void) | undefined)?.(e);
      hide();
    },
  });

  return (
    <>
      {child}
      {mounted &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id={id}
            role="tooltip"
            {...anim}
            className={cx(
              'pointer-events-none fixed z-[3100] max-w-64 rounded-sm border border-rule bg-surface px-2 py-1 text-sm text-ink shadow-md',
              leaving ? 'lumen-fade-exit' : 'lumen-fade-enter',
              side === 'top' ? '-translate-x-1/2 -translate-y-full' : '-translate-x-1/2',
            )}
            style={{ left: pos.x, top: pos.y }}
          >
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
