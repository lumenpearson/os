import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { scrollEdges } from '../scrollEdges';

export const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Call `handler` when a pointer-down lands outside every ref.
 *
 * `within` is for a surface whose parts do not all sit inside it. A submenu is
 * portalled to the body — it is a child in the React tree and a stranger in
 * the document — so `contains` says a press on one of its rows is outside the
 * menu that opened it. It is not, and answering as though it were takes the
 * menu away on `pointerdown`, before the `pointerup` that would have run the
 * command: every submenu item in the system was dead for exactly this reason.
 * A selector says what else counts as inside, wherever it was rendered.
 */
export function useClickOutside(
  refs: Array<RefObject<HTMLElement | null>>,
  handler: () => void,
  enabled = true,
  within?: string,
) {
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (refs.some((r) => r.current?.contains(target))) return;
      if (within !== undefined && target instanceof Element && target.closest(within)) return;
      handler();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [refs, handler, enabled, within]);
}

/**
 * What a menu and every submenu it opens have in common, wherever the portal
 * put them. Both the menubar and `AnchoredMenu` hand this to
 * `useClickOutside`, so a press on a nested row is inside the menu it belongs
 * to rather than outside the one that owns the listener.
 */
export const MENU_SURFACE = '[role="menu"]';

/** Escape key closes a transient surface. */
export function useEscape(handler: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handler();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [handler, enabled]);
}

/** Trap Tab focus inside an element while mounted (dialogs). */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    if (!enabled || !ref.current) return;
    const root = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    const initial = root.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? root;
    initial.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0] as HTMLElement;
      const last = list[list.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener('keydown', onKey);
    return () => {
      root.removeEventListener('keydown', onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [ref, enabled]);
}

/** Observe an element's size. Returns the latest content-box size. */
export function useElementSize<T extends HTMLElement>(): [
  RefObject<T | null>,
  { width: number; height: number },
] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/** Roving keyboard navigation for lists: ArrowUp/Down/Home/End, Enter to activate. */
export function useListNavigation(count: number, onActivate?: (index: number) => void) {
  const [index, setIndex] = useState(-1);
  const onKeyDown = useCallback(
    (e: { key: string; preventDefault: () => void }) => {
      if (count === 0) return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setIndex((i) => (i + 1) % count);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setIndex((i) => (i <= 0 ? count - 1 : i - 1));
          break;
        case 'Home':
          e.preventDefault();
          setIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setIndex(count - 1);
          break;
        case 'Enter':
          if (index >= 0) {
            e.preventDefault();
            onActivate?.(index);
          }
          break;
      }
    },
    [count, index, onActivate],
  );
  return { index, setIndex, onKeyDown };
}

/** Debounce a changing value. */
export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof matchMedia === 'function' ? matchMedia(query).matches : false,
  );
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return matches;
}

/** Latest-value ref, for event handlers that must not be re-bound every render. */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/**
 * Marks a scroller's edges with `data-edge-*` so the stylesheet can draw a
 * shadow where content continues past one.
 *
 * The writes go straight to the element inside a frame rather than through
 * React state: this fires on every scroll event, and a list re-rendering per
 * scroll frame is the thing the engineering rules exist to prevent. The
 * attributes are what `.lumen-scroll` reads; the arithmetic behind them is
 * `scrollEdges`, which is pure and tested next door.
 *
 * A ResizeObserver comes with it because a scroller can stop overflowing
 * without anybody scrolling — a window widened, a filter applied, a sidebar
 * folded away — and a shadow left under content that now fits is a claim that
 * there is more of it.
 */
export function useScrollEdges<T extends HTMLElement>(ref: RefObject<T | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const edges = scrollEdges(el);
      for (const [edge, past] of Object.entries(edges)) {
        if (past) el.dataset[`edge${edge[0]?.toUpperCase()}${edge.slice(1)}`] = 'true';
        else delete el.dataset[`edge${edge[0]?.toUpperCase()}${edge.slice(1)}`];
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    el.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(el);
    // The content's own size matters as much as the port's: a list that grows
    // by a row overflows a box that never changed.
    for (const child of el.children) observer.observe(child);
    return () => {
      el.removeEventListener('scroll', schedule);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ref]);
}

/**
 * How long the system says a piece of motion lasts, in ms, read from the
 * token rather than repeated here.
 *
 * The duration tokens are what Personalisation writes to: Reduce Motion and
 * the per-category switches set them to zero, and `prefers-reduced-motion`
 * does the same. Reading the live value is therefore how a hook in this
 * package obeys a setting it is not allowed to import — `packages/ui` sits
 * below the kernel, so it cannot ask the settings store anything.
 */
export function motionDuration(token: string): number {
  if (typeof document === 'undefined') return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  if (raw.endsWith('ms')) return Number.parseFloat(raw) || 0;
  if (raw.endsWith('s')) return (Number.parseFloat(raw) || 0) * 1000;
  return 0;
}

/**
 * Which of the Animation settings a piece of motion answers to. The value
 * goes on the element as `data-anim`, where the stylesheet switches it off,
 * and it names the duration token this hook waits on — so a category can
 * never be animated by one and timed by the other.
 */
export type MotionCategory = 'menu' | 'dialog' | 'panel';

export interface Presence {
  /** Whether to render at all. */
  mounted: boolean;
  /** True while the exit plays: pick the exit class over the entrance one. */
  leaving: boolean;
  /** Spread onto the animated element, so the settings switch can find it. */
  anim: { 'data-anim': MotionCategory };
}

/**
 * Keeps something on screen long enough to leave.
 *
 * Everything in the OS arrives with an animation and, until now, vanished
 * between one frame and the next: React unmounts on the same tick the flag
 * goes false, so there is nothing left to animate. This holds the node for
 * the length of its exit and reports which way it is going, so the
 * stylesheet can play the reverse of the entrance.
 *
 * The duration comes from the token, so with motion off it is zero and the
 * node unmounts immediately. That matters for more than taste: a scrim that
 * lingered invisibly would go on swallowing clicks.
 */
export function usePresence(open: boolean, category: MotionCategory = 'dialog'): Presence {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    const ms = motionDuration(`--duration-${category}`);
    if (ms <= 0) {
      setMounted(false);
      return;
    }
    setLeaving(true);
    const timer = setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, ms);
    return () => clearTimeout(timer);
  }, [open, mounted, category]);

  return { mounted, leaving, anim: ANIM[category] };
}

/** Frozen per category, so spreading it never changes a prop identity. */
const ANIM: Record<MotionCategory, { 'data-anim': MotionCategory }> = {
  menu: { 'data-anim': 'menu' },
  dialog: { 'data-anim': 'dialog' },
  panel: { 'data-anim': 'panel' },
};

export interface Departing<T> {
  key: string;
  item: T;
  /** False once the item has left the list and is only playing its exit. */
  present: boolean;
}

/**
 * `usePresence` for a list: what to render, given what is still in it.
 *
 * A notification banner, a toast, a row being deleted — each leaves a list
 * rather than a boolean, and React takes it away on the tick it goes. This
 * returns the live items plus the ones that have just left, each held for the
 * length of its exit and each still in the place it held, so the list closes
 * up around it instead of snapping shut.
 *
 * With motion off the duration is zero and nothing is held back, which is the
 * same guarantee `usePresence` makes and for the same reason.
 */
export function useDeparting<T>(
  items: readonly T[],
  key: (item: T) => string,
  category: MotionCategory = 'panel',
): Array<Departing<T>> {
  const [departed, setDeparted] = useState<Array<Departing<T> & { index: number }>>([]);
  const previous = useRef<Array<{ key: string; item: T }>>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const current = items.map((item) => ({ key: key(item), item }));
  const alive = new Set(current.map((c) => c.key));

  /*
   * What has gone since the last render, worked out during this one rather
   * than in the effect below. An effect runs after the paint, so leaving it
   * to state would take the item away for a frame and then put it back — a
   * blink, which is worse than the disappearance it was meant to soften.
   *
   * Each one remembers the place it held, so it can be put back into the list
   * where it was rather than at the end of it.
   */
  const justGone = previous.current
    .map((p, index) => ({ ...p, index, present: false }))
    .filter((p) => !alive.has(p.key));
  const holding =
    justGone.length > 0 && motionDuration(`--duration-${category}`) > 0 ? justGone : [];

  /*
   * No dependency array: the diff is against the previous render, so it has
   * to see every one. It sets state only when the membership actually
   * changed, and the timers live in a ref rather than in a cleanup — a
   * cleanup here would restart every exit on every unrelated re-render.
   */
  useEffect(() => {
    previous.current = current;
    // Anything that came back has stopped leaving.
    for (const [k, timer] of timers.current) {
      if (!alive.has(k)) continue;
      clearTimeout(timer);
      timers.current.delete(k);
    }
    for (const gone of holding) {
      if (timers.current.has(gone.key)) continue;
      timers.current.set(
        gone.key,
        setTimeout(
          () => {
            timers.current.delete(gone.key);
            setDeparted((d) => d.filter((x) => x.key !== gone.key));
          },
          motionDuration(`--duration-${category}`),
        ),
      );
    }
    setDeparted((d) => {
      const kept = d.filter((x) => !alive.has(x.key));
      const added = holding.filter((g) => !kept.some((x) => x.key === g.key));
      return kept.length === d.length && added.length === 0 ? d : [...kept, ...added];
    });
  });

  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const timer of running.values()) clearTimeout(timer);
      running.clear();
    };
  }, []);

  const held = [...departed, ...holding.filter((g) => !departed.some((d) => d.key === g.key))];
  if (held.length === 0) return current.map((c) => ({ ...c, present: true }));
  const result: Array<Departing<T>> = current.map((c) => ({ ...c, present: true }));
  for (const leaving of [...held].sort((a, b) => a.index - b.index)) {
    result.splice(Math.min(leaving.index, result.length), 0, {
      key: leaving.key,
      item: leaving.item,
      present: false,
    });
  }
  return result;
}
