import { createKernel, type Kernel, useSettingsStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { MemoryAdapter } from '@lumen/vfs';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SETTINGS_ROWS, searchSettings } from '../sections';
import { AnimationPage } from './Animation';

let kernel: Kernel;
let container: HTMLElement;

const animation = () => useSettingsStore.getState().settings.animation;

beforeEach(async () => {
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  const view = render(
    <KernelProvider kernel={kernel}>
      <AnimationPage />
    </KernelProvider>,
  );
  container = view.container;
});

afterEach(() => {
  cleanup();
  kernel.dispose();
});

describe('AnimationPage', () => {
  it('writes the speed the slider is moved to', () => {
    const slider = screen.getByRole('slider', { name: 'Animation speed' });
    fireEvent.change(slider, { target: { value: '0.5' } });
    expect(animation().speed).toBe(0.5);
    expect(screen.getByText('0.5×')).toBeInTheDocument();
  });

  it('calls a speed of zero Off rather than 0×', () => {
    fireEvent.change(screen.getByRole('slider', { name: 'Animation speed' }), {
      target: { value: '0' },
    });
    expect(animation().speed).toBe(0);
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('turns one category off and leaves the others alone', async () => {
    const user = userEvent.setup();
    expect(animation().windows).toBe(true);
    await user.click(screen.getByRole('switch', { name: 'Open and close' }));
    expect(animation().windows).toBe(false);
    expect(animation().menus).toBe(true);
    expect(animation().dialogs).toBe(true);
  });

  it('has a switch for every category the schema names', async () => {
    const user = userEvent.setup();
    for (const name of ['Menus', 'Dialogs', 'Panels', 'Pages', 'Press']) {
      await user.click(screen.getByRole('switch', { name }));
    }
    expect(animation().menus).toBe(false);
    expect(animation().dialogs).toBe(false);
    expect(animation().panels).toBe(false);
    expect(animation().pages).toBe(false);
    expect(animation().press).toBe(false);
  });

  it('chooses the minimise animation', async () => {
    const user = userEvent.setup();
    const group = screen.getByRole('radiogroup', { name: 'Minimise' });
    await user.click(within(group).getByRole('radio', { name: 'Fade' }));
    expect(animation().minimize).toBe('fade');
    await user.click(within(group).getByRole('radio', { name: 'None' }));
    expect(animation().minimize).toBe('none');
  });

  it('starts with smoothing off and turns it on', async () => {
    const user = userEvent.setup();
    const smooth = screen.getByRole('switch', { name: 'Smooth a window while it is dragged' });
    expect(smooth).not.toBeChecked();
    await user.click(smooth);
    expect(animation().windowMove).toBe(true);
  });

  it('renders a row for every indexed row id, and indexes every row it renders', () => {
    const indexed = SETTINGS_ROWS.filter((r) => r.section === 'animation').map((r) => r.id);
    const rendered = [...container.querySelectorAll('[data-row]')].map((el) =>
      el.getAttribute('data-row'),
    );
    expect([...indexed].sort()).toEqual([...rendered].sort());
  });

  it('takes the search to rows that exist on the page', () => {
    const result = searchSettings('drag').find((r) => r.section.id === 'animation');
    expect(result?.rows).toContain('animation.windowMove');
    for (const id of result?.rows ?? []) {
      expect(container.querySelector(`[data-row="${id}"]`)).not.toBeNull();
    }
  });
});
