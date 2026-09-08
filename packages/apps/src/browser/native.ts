/**
 * Driving the host's real web views from the tab list.
 *
 * On the desktop a tab is not an iframe but a web view the host owns, drawn
 * over the rectangle the browser reserves for the page. The host is told what
 * to do with words — open, navigate, reload — so this file works out which
 * words to say by comparing what the tabs want with what the host was last
 * told, and nothing here touches a window.
 */

import type { Tab } from './tabs';
import { isInternalUrl } from './url';

/** What one tab wants of its view. */
export interface ViewWish {
  id: string;
  url: string;
  /** Bumped when the same address is asked for again. */
  generation: number;
  zoom: number;
}

/** What the host was last told about a view. */
export interface ViewSent {
  url: string;
  generation: number;
  zoom: number;
}

export type ViewCommand =
  | { kind: 'open'; id: string; url: string }
  | { kind: 'navigate'; id: string; url: string }
  | { kind: 'reload'; id: string }
  | { kind: 'zoom'; id: string; factor: number }
  | { kind: 'close'; id: string };

/**
 * The tabs that get a view: everything that is a web page.
 *
 * An internal page — the start page, history, settings — is drawn by Lumen in
 * its own markup and has nothing for a view to load. A site the user sends
 * outside Lumen is not opened here at all.
 */
export function viewsWanted(tabs: readonly Tab[]): ViewWish[] {
  return tabs
    .filter((tab) => !isInternalUrl(tab.url) && tab.status !== 'external')
    .map((tab) => ({ id: tab.id, url: tab.url, generation: tab.generation, zoom: tab.zoom }));
}

/**
 * What to say to the host, given what the tabs want and what it was last
 * told. Order matters: a view is opened before it is zoomed, and a view for a
 * tab that has gone is closed rather than left behind the window.
 */
export function viewCommands(
  wanted: readonly ViewWish[],
  sent: ReadonlyMap<string, ViewSent>,
): ViewCommand[] {
  const commands: ViewCommand[] = [];
  const live = new Set(wanted.map((wish) => wish.id));

  for (const id of sent.keys()) {
    if (!live.has(id)) commands.push({ kind: 'close', id });
  }

  for (const wish of wanted) {
    const before = sent.get(wish.id);
    if (!before) {
      commands.push({ kind: 'open', id: wish.id, url: wish.url });
    } else if (before.url !== wish.url) {
      commands.push({ kind: 'navigate', id: wish.id, url: wish.url });
    } else if (before.generation !== wish.generation) {
      // The same address asked for again is a reload, not a navigation: a
      // navigation to where the view already is would leave the page's own
      // scroll and form state behind without being asked to.
      commands.push({ kind: 'reload', id: wish.id });
    }
    if (!before || before.zoom !== wish.zoom) {
      commands.push({ kind: 'zoom', id: wish.id, factor: wish.zoom });
    }
  }
  return commands;
}

/**
 * What the host knows once the commands above have been carried out. A view
 * for a tab that has gone leaves the record with it, so the same tab id
 * opening again is opened rather than navigated.
 */
export function afterCommands(wanted: readonly ViewWish[]): Map<string, ViewSent> {
  return new Map(
    wanted.map((wish) => [
      wish.id,
      { url: wish.url, generation: wish.generation, zoom: wish.zoom },
    ]),
  );
}

/** A rectangle in the interface's own pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/**
 * Whether the page area is free of everything the interface draws.
 *
 * A web view is a native surface: it is painted over the interface, not
 * inside it, so nothing Lumen draws can appear on top of one. A window in
 * front of the browser, an open menu, a dialog — each of them would be
 * covered by the page rather than covering it, which is why the page steps
 * out of the way instead.
 */
export function isClear(page: Box, above: readonly Box[]): boolean {
  if (page.width <= 1 || page.height <= 1) return false;
  return !above.some((box) => overlaps(page, box));
}

/** The attribute a portal carries when it is drawn over the whole interface. */
export const OVER_PAGE = 'data-over-page';
