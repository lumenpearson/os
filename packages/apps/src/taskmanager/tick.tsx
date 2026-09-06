/**
 * One interval for every ticking cell in the window. Subscribers write to the
 * DOM through a ref, so the uptime column advances each second without the
 * table re-rendering.
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef } from 'react';

type Listener = (now: number) => void;
type Subscribe = (listener: Listener) => () => void;

const TickContext = createContext<Subscribe | null>(null);

export function TickProvider({
  paused = false,
  intervalMs = 1000,
  children,
}: {
  paused?: boolean;
  intervalMs?: number;
  children: ReactNode;
}) {
  const listeners = useRef<Set<Listener>>(new Set());
  const subscribe = useCallback<Subscribe>((listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    const fire = () => {
      const now = Date.now();
      for (const listener of listeners.current) listener(now);
    };
    fire();
    const id = setInterval(fire, intervalMs);
    return () => clearInterval(id);
  }, [paused, intervalMs]);

  return <TickContext.Provider value={subscribe}>{children}</TickContext.Provider>;
}

/** Run `listener` on every tick. The handler may change every render. */
export function useTick(listener: Listener) {
  const subscribe = useContext(TickContext);
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => {
    if (!subscribe) return;
    return subscribe((now) => latest.current(now));
  }, [subscribe]);
}
