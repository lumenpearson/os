import { beforeEach, describe, expect, it } from 'vitest';
import { useProcessStore } from './store';

beforeEach(() => {
  useProcessStore.setState({ processes: {}, nextPid: 100, tickedAt: null });
});

/** Processes are stamped with the real clock, so the ticks have to be too. */
const later = (seconds: number) => Date.now() + seconds * 1_000;

describe('the load tick', () => {
  it('reads busier with more windows open', () => {
    const store = useProcessStore.getState();
    const quiet = store.spawn('lumen.notes', 'Notes', {});
    const busy = store.spawn('lumen.editor', 'Text Editor', {});
    for (const id of ['w1', 'w2', 'w3', 'w4']) store.attachWindow(busy.pid, id);
    store.attachWindow(quiet.pid, 'w5');

    // Far enough ahead that both are past their startup burst and settled.
    for (let i = 1; i <= 40; i++) useProcessStore.getState().tick(later(i));
    const after = useProcessStore.getState().processes;
    expect(after[busy.pid]?.cpu ?? 0).toBeGreaterThan(after[quiet.pid]?.cpu ?? 0);
    expect(after[busy.pid]?.memory ?? 0).toBeGreaterThan(after[quiet.pid]?.memory ?? 0);
  });

  it('settles instead of wandering', () => {
    const store = useProcessStore.getState();
    const p = store.spawn('lumen.clock', 'Clock', {}, true);
    for (let i = 1; i <= 40; i++) useProcessStore.getState().tick(later(i));
    const settled = useProcessStore.getState().processes[p.pid]?.cpu ?? -1;
    for (let i = 41; i <= 60; i++) useProcessStore.getState().tick(later(i));
    const afterwards = useProcessStore.getState().processes[p.pid]?.cpu ?? -1;
    expect(Math.abs(afterwards - settled)).toBeLessThan(2);
  });
});
