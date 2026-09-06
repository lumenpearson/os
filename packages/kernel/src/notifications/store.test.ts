import { beforeEach, describe, expect, it } from 'vitest';
import { useNotificationStore } from './store';

beforeEach(() => {
  useNotificationStore.setState({ items: [], banners: [] });
});

describe('a silent notification', () => {
  it('reaches the list but never the banner queue', () => {
    const store = useNotificationStore.getState();
    store.post({ appId: 'lumen.files', title: 'Copied' });
    store.post({ appId: 'lumen.files', title: 'While Do Not Disturb is on', silent: true });

    const after = useNotificationStore.getState();
    expect(after.items).toHaveLength(2);
    // The shell renders no banners under Do Not Disturb, so a queued id would
    // never be shown, never time out and never be dismissed — and the whole
    // quiet period would burst onto the screen the moment it was switched off.
    expect(after.banners).toHaveLength(1);
    expect(after.items[0]?.title).toBe('While Do Not Disturb is on');
  });

  it('does not queue however many arrive', () => {
    const store = useNotificationStore.getState();
    for (let i = 0; i < 10; i += 1) {
      store.post({ appId: 'lumen.files', title: `n${i}`, silent: true });
    }
    expect(useNotificationStore.getState().banners).toHaveLength(0);
    expect(useNotificationStore.getState().items).toHaveLength(10);
  });
});
