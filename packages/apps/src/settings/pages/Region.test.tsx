import { createKernel, type Kernel, useSettingsStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { MemoryAdapter } from '@lumen/vfs';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RegionPage } from './Region';

let kernel: Kernel;

const region = () => useSettingsStore.getState().settings.region;
const setLanguage = (language: 'auto' | 'en' | 'ru') =>
  act(() => useSettingsStore.getState().patch('region', { language }));

beforeEach(async () => {
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  render(
    <KernelProvider kernel={kernel}>
      <RegionPage />
    </KernelProvider>,
  );
});

afterEach(() => {
  cleanup();
  kernel.dispose();
});

describe('the Language & Region page', () => {
  it('starts by following the region', () => {
    expect(region().language).toBe('auto');
  });

  it('rewrites itself in the language it is asked for', () => {
    expect(screen.getByText('Language & Region')).toBeInTheDocument();
    expect(screen.getByText('First day of week')).toBeInTheDocument();

    setLanguage('ru');

    // The page is the one surface where the switch has to be visible in the
    // same breath as making it: its own title and rows turn over.
    expect(screen.getByText('Язык и регион')).toBeInTheDocument();
    expect(screen.getByText('Первый день недели')).toBeInTheDocument();
    expect(screen.queryByText('Language & Region')).not.toBeInTheDocument();

    setLanguage('en');
    expect(screen.getByText('Language & Region')).toBeInTheDocument();
  });

  it('offers only the languages that have a dictionary behind them', () => {
    // The first control on the page, which is the interface-language picker;
    // `Row` labels its child by position rather than by `for`.
    const picker = screen.getAllByRole('combobox')[0];
    if (!picker) throw new Error('the page drew no language picker');
    const offered = [...picker.querySelectorAll('option')].map((o) => o.value);
    // The region list below it carries fourteen tags because it formats dates
    // for all of them. Offering fourteen interface languages and delivering
    // two is the promise this page used to break.
    expect(offered).toEqual(['auto', 'en', 'ru']);
  });
});
