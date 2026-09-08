import { MemoryAdapter, Vfs } from '@lumen/vfs';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useJsonFile } from './files';

/**
 * A real in-memory VFS stands behind `useVfs`, but its `readJson` is gated on
 * a promise the test resolves by hand. That gate is the point: the bug being
 * pinned here only exists in the window between the read starting and the read
 * landing, and a VFS that answers in a microtask closes that window before a
 * click can get into it — so a test written against one passes whether the fix
 * is present or not.
 */
let vfs: Vfs;
vi.mock('@lumen/kernel/react', () => ({ useVfs: () => vfs }));

interface Prefs {
  mode: string;
}

/** A promise plus the handles to settle it later. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Holds every `readJson` until the test releases it. */
function gateReads() {
  const gate = deferred<void>();
  const real = vfs.readJson.bind(vfs);
  vi.spyOn(vfs, 'readJson').mockImplementation(async (path: string) => {
    await gate.promise;
    return real(path);
  });
  return gate;
}

function Harness({ path }: { path: string | null }) {
  const [prefs, setPrefs, { loaded }] = useJsonFile<Prefs>(path, { mode: 'fallback' });
  return (
    <div>
      <output data-testid="mode">{prefs.mode}</output>
      <span data-testid="loaded">{String(loaded)}</span>
      <button type="button" onClick={() => setPrefs({ mode: 'chosen' })}>
        choose
      </button>
    </div>
  );
}

describe('useJsonFile', () => {
  beforeEach(() => {
    vfs = new Vfs(new MemoryAdapter());
    vi.restoreAllMocks();
  });

  it('reads the stored document', async () => {
    await vfs.writeJson('/prefs.json', { mode: 'stored' }, { recursive: true });
    render(<Harness path="/prefs.json" />);
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('stored'));
  });

  it('falls back when the file is missing', async () => {
    render(<Harness path="/missing.json" />);
    await waitFor(() => expect(screen.getByTestId('loaded')).toHaveTextContent('true'));
    expect(screen.getByTestId('mode')).toHaveTextContent('fallback');
  });

  it('does not let a missing-file read revert a value written before it resolved', async () => {
    // The first-run case. The read rejects, and its catch used to reset the
    // state to the fallback even though the caller had already chosen — while
    // the debounced write of that choice still reached disk, so what was on
    // screen and what was in the file disagreed.
    const gate = gateReads();
    render(<Harness path="/first-run.json" />);
    await userEvent.click(screen.getByRole('button', { name: 'choose' }));
    expect(screen.getByTestId('mode')).toHaveTextContent('chosen');

    await act(async () => {
      gate.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('loaded')).toHaveTextContent('true'));
    expect(screen.getByTestId('mode')).toHaveTextContent('chosen');
  });

  it('does not let a stored document overwrite a value written before it resolved', async () => {
    await vfs.writeJson('/prefs.json', { mode: 'stored' }, { recursive: true });
    const gate = gateReads();
    render(<Harness path="/prefs.json" />);
    await userEvent.click(screen.getByRole('button', { name: 'choose' }));
    expect(screen.getByTestId('mode')).toHaveTextContent('chosen');

    await act(async () => {
      gate.resolve();
    });
    await waitFor(() => expect(screen.getByTestId('loaded')).toHaveTextContent('true'));
    expect(screen.getByTestId('mode')).toHaveTextContent('chosen');
  });

  it('persists the written value to the path', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<Harness path="/prefs.json" />);
      await userEvent.click(screen.getByRole('button', { name: 'choose' }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });
      await expect(vfs.readJson<Prefs>('/prefs.json')).resolves.toEqual({ mode: 'chosen' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads again when the path changes', async () => {
    await vfs.writeJson('/a.json', { mode: 'a' }, { recursive: true });
    await vfs.writeJson('/b.json', { mode: 'b' }, { recursive: true });
    const view = render(<Harness path="/a.json" />);
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('a'));
    view.rerender(<Harness path="/b.json" />);
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('b'));
  });
});
