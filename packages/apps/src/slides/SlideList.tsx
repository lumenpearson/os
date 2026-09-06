import { AnchoredMenu, cx, useContextMenu } from '@lumen/ui';
import type { KeyboardEvent, PointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { type Deck, type DeckTheme, SLIDE_WIDTH } from './deck';
import { SlideCanvas } from './SlideCanvas';

/** Thumbnails are 132 px wide; the number column takes the rest of the rail. */
const THUMB_SCALE = 132 / SLIDE_WIDTH;
/** Pointer travel before a press turns into a drag. */
const DRAG_THRESHOLD = 4;

export interface SlideListProps {
  deck: Deck;
  theme: DeckTheme;
  selected: number;
  onSelect: (index: number) => void;
  onReorder: (from: number, to: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
}

/**
 * The slide rail: every thumbnail is the real slide scaled down, so what is on
 * the canvas is what is in the list. Rows drag to reorder — the drag writes
 * transforms straight to the DOM inside a frame callback.
 */
export function SlideList({
  deck,
  theme,
  selected,
  onSelect,
  onReorder,
  onDuplicate,
  onDelete,
}: SlideListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);
  const markerRef = useRef<HTMLDivElement>(null);
  const menu = useContextMenu();
  const [menuIndex, setMenuIndex] = useState(0);
  const last = deck.slides.length - 1;

  useEffect(() => {
    const row = rowRefs.current[selected];
    row?.scrollIntoView?.({ block: 'nearest' });
    if (listRef.current?.contains(document.activeElement)) row?.focus();
  }, [selected]);

  const startDrag = (index: number) => (event: PointerEvent<HTMLLIElement>) => {
    if (event.button !== 0) return;
    onSelect(index);
    const row = event.currentTarget;
    const list = listRef.current;
    const rects = rowRefs.current.map((el) => el?.getBoundingClientRect() ?? null);
    const own = rects[index];
    if (!list || !own) return;
    const startY = event.clientY;
    const listTop = list.getBoundingClientRect().top - list.scrollTop;
    let active = false;
    let target = index;
    let offset = 0;
    let frame = 0;

    const paint = () => {
      frame = 0;
      row.style.transform = `translateY(${offset}px)`;
      const rect = rects[target];
      const marker = markerRef.current;
      if (!rect || !marker) return;
      marker.style.transform = `translateY(${(target <= index ? rect.top : rect.bottom) - listTop}px)`;
      marker.style.opacity = '1';
    };

    const onMove = (move: globalThis.PointerEvent) => {
      offset = move.clientY - startY;
      if (!active) {
        if (Math.abs(offset) < DRAG_THRESHOLD) return;
        active = true;
        row.style.zIndex = '1';
        row.style.willChange = 'transform';
      }
      const center = own.top + own.height / 2 + offset;
      let next = 0;
      for (let i = 0; i < rects.length; i += 1) {
        const rect = rects[i];
        if (i === index || !rect) continue;
        if (center > rect.top + rect.height / 2) next += 1;
      }
      target = next;
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const finish = () => {
      row.removeEventListener('pointermove', onMove);
      row.removeEventListener('pointerup', finish);
      row.removeEventListener('pointercancel', finish);
      if (frame) cancelAnimationFrame(frame);
      row.style.transform = '';
      row.style.zIndex = '';
      row.style.willChange = '';
      const marker = markerRef.current;
      if (marker) marker.style.opacity = '0';
      if (active && target !== index) onReorder(index, target);
    };

    row.setPointerCapture(event.pointerId);
    row.addEventListener('pointermove', onMove);
    row.addEventListener('pointerup', finish);
    row.addEventListener('pointercancel', finish);
  };

  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLLIElement>) => {
    const step = (delta: number) => {
      const to = Math.max(0, Math.min(last, index + delta));
      if (to === index) return;
      if (event.altKey) onReorder(index, to);
      else onSelect(to);
    };
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        step(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        step(-1);
        break;
      case 'Home':
        event.preventDefault();
        onSelect(0);
        break;
      case 'End':
        event.preventDefault();
        onSelect(last);
        break;
    }
  };

  return (
    <div className="flex w-44 shrink-0 flex-col border-r border-rule bg-surface">
      <ul
        ref={listRef}
        role="listbox"
        aria-label="Slides"
        aria-orientation="vertical"
        className="lumen-scroll relative flex min-h-0 flex-1 flex-col gap-1 p-2"
      >
        <div
          ref={markerRef}
          aria-hidden
          className="pointer-events-none absolute inset-x-2 top-0 h-px bg-accent opacity-0"
        />
        {deck.slides.map((slide, index) => (
          <li
            key={slide.id}
            ref={(el) => {
              rowRefs.current[index] = el;
            }}
            role="option"
            aria-selected={index === selected}
            aria-label={`Slide ${index + 1}`}
            tabIndex={index === selected ? 0 : -1}
            onPointerDown={startDrag(index)}
            onKeyDown={onKeyDown(index)}
            onContextMenu={(event) => {
              setMenuIndex(index);
              onSelect(index);
              menu.openAt(event);
            }}
            className={cx(
              'relative flex shrink-0 cursor-default touch-none items-start gap-1.5 rounded-sm p-1 lumen-focus',
              index === selected ? 'bg-selection' : 'hover:bg-surface-2',
            )}
          >
            <span className="mono w-4 shrink-0 pt-0.5 text-right text-2xs text-ink-3 tabular-nums">
              {index + 1}
            </span>
            <SlideCanvas
              slide={slide}
              theme={theme}
              scale={THUMB_SCALE}
              className="pointer-events-none"
            />
          </li>
        ))}
      </ul>
      {deck.slides.length === 0 && <p className="px-3 py-2 text-sm text-ink-3">No slides yet.</p>}
      <AnchoredMenu
        open={menu.open}
        at={menu.at}
        onClose={menu.close}
        items={[
          { id: 'duplicate', label: 'Duplicate', onSelect: () => onDuplicate(menuIndex) },
          {
            id: 'delete',
            label: 'Delete',
            danger: true,
            onSelect: () => onDelete(menuIndex),
          },
          { type: 'separator' },
          {
            id: 'up',
            label: 'Move Up',
            enabled: menuIndex > 0,
            onSelect: () => onReorder(menuIndex, menuIndex - 1),
          },
          {
            id: 'down',
            label: 'Move Down',
            enabled: menuIndex < last,
            onSelect: () => onReorder(menuIndex, menuIndex + 1),
          },
        ]}
      />
    </div>
  );
}
