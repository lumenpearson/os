import { create } from 'zustand';
import { events } from '../events';
import type { AppId, Notification } from '../types';

export interface PostNotificationInput {
  appId: AppId;
  title: string;
  body?: string;
  actions?: Notification['actions'];
  timeout?: number;
  onAction?: Notification['onAction'];
  /**
   * Keep it out of the banner queue. Do Not Disturb sets this: the shell
   * renders no banners while it is on, so a queued id would never be shown,
   * never time out and never be dismissed — and every notification from the
   * whole quiet period would burst onto the screen the moment it was
   * switched off. The notification still belongs in the list.
   */
  silent?: boolean;
}

interface NotificationStore {
  items: Notification[];
  /** Ids currently shown as banners. */
  banners: string[];
  post: (input: PostNotificationInput) => Notification;
  dismissBanner: (id: string) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
  clearApp: (appId: AppId) => void;
}

let seq = 0;

export const useNotificationStore = create<NotificationStore>((set) => ({
  items: [],
  banners: [],
  post: (input) => {
    const n: Notification = {
      id: `n${++seq}_${Date.now().toString(36)}`,
      appId: input.appId,
      title: input.title,
      body: input.body,
      createdAt: Date.now(),
      read: false,
      actions: input.actions,
      timeout: input.timeout,
      onAction: input.onAction,
    };
    set((s) => ({
      items: [n, ...s.items].slice(0, 200),
      banners: input.silent ? s.banners : [...s.banners, n.id],
    }));
    events.emit('notification:post', n);
    return n;
  },
  dismissBanner: (id) => set((s) => ({ banners: s.banners.filter((b) => b !== id) })),
  markRead: (id) =>
    set((s) => ({ items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
  markAllRead: () => set((s) => ({ items: s.items.map((n) => ({ ...n, read: true })) })),
  remove: (id) =>
    set((s) => ({
      items: s.items.filter((n) => n.id !== id),
      banners: s.banners.filter((b) => b !== id),
    })),
  clearAll: () => set({ items: [], banners: [] }),
  clearApp: (appId) =>
    set((s) => {
      const keep = s.items.filter((n) => n.appId !== appId);
      const ids = new Set(keep.map((n) => n.id));
      return { items: keep, banners: s.banners.filter((b) => ids.has(b)) };
    }),
}));

export const selectUnreadCount = (s: NotificationStore) => s.items.filter((n) => !n.read).length;
