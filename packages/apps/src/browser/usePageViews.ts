/**
 * The desktop browser: one real web view per tab, owned by the host and drawn
 * over the rectangle this window reserves for the page.
 *
 * The view is a native surface. It is painted above everything the interface
 * draws and cannot be clipped by it, so two things are this hook's whole job:
 * telling the host which views should exist and where they are pointed
 * (`native.ts` works that out), and telling it, on every frame, exactly where
 * the page area is and whether anything is on top of it.
 *
 * Measuring every frame sounds expensive and is not: it is one
 * `getBoundingClientRect` per window plus a string read, and the host is only
 * called when a number actually changed. It is also the only thing that keeps
 * up with a window being dragged, a menu opening, and a window animating
 * closed, without any of them having to know a web view exists.
 */

import { usePlatform } from '@lumen/kernel/react';
import type { PageRect } from '@lumen/platform';
import { type RefObject, useEffect, useRef } from 'react';
import {
  afterCommands,
  type Box,
  isClear,
  OVER_PAGE,
  type ViewSent,
  viewCommands,
  viewsWanted,
} from './native';
import type { Tab } from './tabs';

/** Where an element is, in the pixels the host measures its window in. */
function boxOf(el: Element): Box {
  const rect = el.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

/**
 * The stacking order of a window, read from the style attribute rather than
 * from `getComputedStyle`: the shell writes it there, and a computed style is
 * a layout flush this loop does not need to pay for sixty times a second.
 */
function layerOf(el: Element): number {
  const z = Number.parseInt((el as HTMLElement).style.zIndex, 10);
  return Number.isNaN(z) ? 0 : z;
}

/** Everything the interface would draw over the page area. */
function coversOf(host: Element): Box[] {
  const doc = host.ownerDocument;
  const boxes: Box[] = [];
  const mine = host.closest('[data-window-id]');
  const depth = mine ? layerOf(mine) : 0;
  for (const el of doc.querySelectorAll('[data-window-id]')) {
    if (el !== mine && layerOf(el) > depth) boxes.push(boxOf(el));
  }
  // Menus, dialogs, popovers and the menubar are portalled to the end of the
  // document and stand above every window, so they are counted whatever the
  // window they belong to.
  for (const el of doc.querySelectorAll(`[${OVER_PAGE}]`)) boxes.push(boxOf(el));
  return boxes;
}

function sameRect(a: PageRect, b: PageRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export interface PageViewsOptions {
  tabs: readonly Tab[];
  activeId: string | null;
  /** The desktop host can do this; a browser cannot, and gets frames instead. */
  enabled: boolean;
  /** The element whose box the page fills. */
  host: RefObject<HTMLElement | null>;
}

export function usePageViews({ tabs, activeId, enabled, host }: PageViewsOptions): void {
  const platform = usePlatform();
  const pages = platform.pages;

  /** What the host was last told about each view. */
  const sent = useRef(new Map<string, ViewSent>());
  /** Where each view was last put, so an unchanged frame says nothing. */
  const placed = useRef(new Map<string, { rect: PageRect; visible: boolean }>());
  /** Read by the frame loop, which is set up once and outlives a tab change. */
  const active = useRef(activeId);
  active.current = activeId;

  // ── which views exist, and where they point ─────────────────────────────

  useEffect(() => {
    if (!enabled) return;
    const wanted = viewsWanted(tabs);
    const commands = viewCommands(wanted, sent.current);
    if (commands.length === 0) return;
    sent.current = afterCommands(wanted);

    let live = true;
    void (async () => {
      for (const command of commands) {
        if (!live) return;
        try {
          switch (command.kind) {
            case 'open': {
              const element = host.current;
              const rect = element ? boxOf(element) : { x: 0, y: 0, width: 1, height: 1 };
              const visible = command.id === active.current && !!element;
              await pages.open(command.id, command.url, rect, visible);
              placed.current.set(command.id, { rect, visible });
              break;
            }
            case 'navigate':
              await pages.navigate(command.id, command.url);
              break;
            case 'reload':
              await pages.reload(command.id);
              break;
            case 'zoom':
              await pages.zoom(command.id, command.factor);
              break;
            case 'close':
              await pages.close(command.id);
              placed.current.delete(command.id);
              break;
          }
        } catch {
          // The host refused, or the view has gone. Forgetting what it was
          // told is what makes the next pass open it again rather than
          // talking to something that is not there.
          sent.current.delete(command.id);
          placed.current.delete(command.id);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [tabs, enabled, pages, host]);

  // ── where the page area is, every frame ─────────────────────────────────

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const element = host.current;
      if (!element) return;
      const rect = boxOf(element);
      const clear = !element.ownerDocument.hidden && isClear(rect, coversOf(element));
      for (const id of sent.current.keys()) {
        const visible = clear && id === active.current;
        const before = placed.current.get(id);
        if (before && before.visible === visible && (!visible || sameRect(before.rect, rect))) {
          continue;
        }
        placed.current.set(id, { rect, visible });
        void pages.place(id, rect, visible).catch(() => placed.current.delete(id));
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, pages, host]);

  // ── the window closed ───────────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;
    const open = sent.current;
    const put = placed.current;
    return () => {
      for (const id of open.keys()) void pages.close(id).catch(() => {});
      open.clear();
      put.clear();
    };
  }, [enabled, pages]);
}
