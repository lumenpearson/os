import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { InstalledSection } from './InstalledSection';
import type { LibraryEntry } from './library';
import type { AvailableUpdate } from './updates';

function entry(over: Partial<LibraryEntry> = {}): LibraryEntry {
  return {
    id: 'com.lumen.stopwatch',
    name: 'Stopwatch',
    description: 'Laps and splits.',
    version: '2.0.0',
    category: 'utilities',
    keywords: [],
    source: 'installed',
    kind: 'html',
    removable: true,
    path: '/Applications/Stopwatch.app',
    definition: null,
    manifest: null,
    ...over,
  } as LibraryEntry;
}

const update: AvailableUpdate = {
  id: 'com.lumen.stopwatch',
  name: 'Stopwatch',
  from: '2.0.0',
  to: '2.1.0',
  summary: { version: '2.1.0' } as AvailableUpdate['summary'],
};

function mount(over: Partial<Parameters<typeof InstalledSection>[0]> = {}) {
  const onUpdateAll = vi.fn();
  render(
    <InstalledSection
      entries={[entry()]}
      selected={null}
      wide
      updates={[]}
      automatic={false}
      onUpdateAll={onUpdateAll}
      onSelect={() => {}}
      onOpen={() => {}}
      onRemove={() => {}}
      {...over}
    />,
  );
  return { onUpdateAll };
}

describe('the updates bar', () => {
  it('is absent when there is nothing to update', () => {
    mount();
    expect(screen.queryByText(/update/i)).not.toBeInTheDocument();
  });

  it('counts the updates and names the versions', () => {
    mount({ updates: [update] });
    expect(screen.getByText('1 update available')).toBeInTheDocument();
    expect(screen.getByText('Stopwatch 2.0.0 → 2.1.0')).toBeInTheDocument();
  });

  it('offers Update All, and calls it once', async () => {
    const { onUpdateAll } = mount({ updates: [update] });
    await userEvent.click(screen.getByRole('button', { name: 'Update All' }));
    expect(onUpdateAll).toHaveBeenCalledTimes(1);
  });

  it('reports rather than asks when the installs are already running', () => {
    mount({ updates: [update], automatic: true });
    expect(screen.getByText('Installing automatically')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update All' })).not.toBeInTheDocument();
  });

  it('still draws the list of installed apps behind it', () => {
    mount({ updates: [update] });
    expect(screen.getByRole('list', { name: 'Installed apps' })).toBeInTheDocument();
  });
});
