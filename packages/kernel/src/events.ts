import type { AppId, LaunchArgs, Notification, Pid, SessionState, WindowId } from './types';

/** Every event the kernel emits, keyed by name. */
export interface KernelEvents {
  'kernel:ready': { bootMs: number };
  'session:change': { from: SessionState; to: SessionState };
  'session:activity': { at: number };
  'process:start': { pid: Pid; appId: AppId; args: LaunchArgs };
  'service:start': { id: string };
  'service:stop': { id: string };
  'process:exit': { pid: Pid; appId: AppId };
  /** A singleton app was launched again; the running instance receives the new args. */
  'process:args': { pid: Pid; args: LaunchArgs };
  'window:open': { windowId: WindowId; pid: Pid };
  'window:close': { windowId: WindowId; pid: Pid };
  'window:focus': { windowId: WindowId | null };
  /** The shell asks a window's app to close; the app may veto (unsaved changes). */
  'window:close-request': { windowId: WindowId };
  'notification:post': Notification;
  'settings:change': { path: string };
  shortcut: { keys: string; windowId: WindowId | null };
  'display:resize': { width: number; height: number };
  'theme:change': { theme: 'light' | 'dark' };
  'apps:change': undefined;
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private readonly handlers = new Map<string, Set<Handler<unknown>>>();

  on<K extends keyof KernelEvents>(event: K, handler: Handler<KernelEvents[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<unknown>);
    return () => this.off(event, handler);
  }

  once<K extends keyof KernelEvents>(event: K, handler: Handler<KernelEvents[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof KernelEvents>(event: K, handler: Handler<KernelEvents[K]>): void {
    this.handlers.get(event)?.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof KernelEvents>(
    event: K,
    ...args: KernelEvents[K] extends undefined ? [] : [KernelEvents[K]]
  ): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of [...set]) {
      try {
        h(args[0]);
      } catch (e) {
        console.error(`[kernel] handler for ${event} failed`, e);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const events = new EventBus();
