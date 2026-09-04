import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../cx';
import { useClickOutside, useEscape } from '../hooks';

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchor: HTMLElement | null;
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom';
  offset?: number;
  width?: number;
  className?: string;
  /** Extra z-index for popovers over menus. */
  zIndex?: number;
}

/** A floating panel anchored to an element (control center, calendar, status items). */
export function Popover({
  open,
  onClose,
  anchor,
  children,
  align = 'end',
  side = 'bottom',
  offset = 6,
  width,
  className,
  zIndex = 1200,
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const refs = useMemo(() => [ref], []);
  useClickOutside(refs, onClose, open);
  useEscape(onClose, open);

  useEffect(() => {
    if (!open || !anchor) {
      setPos(null);
      return;
    }
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const el = ref.current;
      const w = el?.offsetWidth ?? width ?? 280;
      const h = el?.offsetHeight ?? 200;
      let left =
        align === 'end' ? r.right - w : align === 'center' ? r.left + r.width / 2 - w / 2 : r.left;
      let top = side === 'bottom' ? r.bottom + offset : r.top - offset - h;
      left = Math.max(6, Math.min(left, window.innerWidth - w - 6));
      top = Math.max(6, Math.min(top, window.innerHeight - h - 6));
      setPos({ left, top });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
    };
  }, [open, anchor, align, side, offset, width]);

  useEffect(() => {
    if (open) ref.current?.focus({ preventScroll: true });
  }, [open]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      tabIndex={-1}
      className={cx(
        'fixed outline-none rounded-lg border border-rule bg-surface shadow-lg lumen-pop-enter',
        className,
      )}
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width,
        zIndex,
        visibility: pos ? 'visible' : 'hidden',
        ['--lumen-pop-origin' as string]: `${side === 'bottom' ? 'top' : 'bottom'} ${align === 'end' ? 'right' : align === 'center' ? 'center' : 'left'}`,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
