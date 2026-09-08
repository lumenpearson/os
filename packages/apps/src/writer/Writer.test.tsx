import { createKernel, type Kernel, useSettingsStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { MemoryAdapter } from '@lumen/vfs';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import { serializeWriterFile } from './document';
import Writer from './Writer';

let kernel: Kernel;

function mount(args: Record<string, unknown> = {}) {
  return render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: 1, windowId: 'w1', appId: 'lumen.writer', container: null }}>
        <DialogProvider container={null}>
          <FileDialogProvider>
            <Writer pid={1} windowId="w1" args={args} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
}

const page = () => screen.getByRole('textbox', { name: 'Document' });

beforeEach(() => {
  useSettingsStore.getState().patch('keyboard', { modifier: 'ctrl' });
  const platform = { ...createWebPlatform(), adapter: new MemoryAdapter() };
  kernel = createKernel({ platform, apps: [] });
});

afterEach(() => {
  cleanup();
  kernel.dispose();
});

describe('Writer', () => {
  it('opens on an empty page with the formatting toolbar', () => {
    mount();
    expect(page()).toBeInTheDocument();
    expect(page().dataset.empty).toBe('true');
    for (const label of ['Bold', 'Italic', 'Underline', 'Bulleted list', 'Insert date']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Paragraph style')).toHaveValue('p');
  });

  it('loads a document given on the command line', async () => {
    await kernel.vfs.writeText(
      '/Documents/Notes.lwr',
      serializeWriterFile('<h1>Trip notes</h1><p>Two nights in the hills.</p>', 'Trip notes'),
      { recursive: true },
    );
    mount({ path: '/Documents/Notes.lwr' });
    expect(await screen.findByText('Trip notes')).toBeInTheDocument();
    expect(screen.getByText('Two nights in the hills.')).toBeInTheDocument();
    expect(screen.getByText('/Documents/Notes.lwr')).toBeInTheDocument();
  });

  it('reports a file it cannot read', async () => {
    await kernel.vfs.writeText('/Documents/Broken.lwr', 'not json', { recursive: true });
    mount({ path: '/Documents/Broken.lwr' });
    expect(await screen.findByText(/not a Writer document/)).toBeInTheDocument();
  });

  it('opens RTF as read-only text with a way out', async () => {
    await kernel.vfs.writeText('/Documents/Memo.rtf', '{\\rtf1\\ansi Hello memo.\\par}', {
      recursive: true,
    });
    mount({ path: '/Documents/Memo.rtf' });
    expect(await screen.findByText('Hello memo.')).toBeInTheDocument();
    expect(screen.getByText(/RTF is imported as text/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save As…' })).toBeInTheDocument();
    expect(page()).toHaveAttribute('aria-readonly', 'true');
  });

  it('counts the words of the open document', async () => {
    await kernel.vfs.writeText(
      '/Documents/Notes.lwr',
      serializeWriterFile('<p>one two three four</p>', null),
      { recursive: true },
    );
    mount({ path: '/Documents/Notes.lwr' });
    expect(await screen.findByText('4 words')).toBeInTheDocument();
  });

  it('finds matches from the toolbar', async () => {
    const user = userEvent.setup();
    await kernel.vfs.writeText(
      '/Documents/Notes.lwr',
      serializeWriterFile('<p>a cat and another cat</p>', null),
      { recursive: true },
    );
    mount({ path: '/Documents/Notes.lwr' });
    await screen.findByText('a cat and another cat');
    await user.click(screen.getByLabelText('Find'));
    await user.type(screen.getByLabelText('Find in document'), 'cat');
    expect(await screen.findByText('1 of 2')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Next match'));
    expect(await screen.findByText('2 of 2')).toBeInTheDocument();
  });

  it('hides the toolbar in reading mode', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByLabelText('Reading mode'));
    expect(screen.queryByLabelText('Bold')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Exit reading mode' }));
    expect(screen.getByLabelText('Bold')).toBeInTheDocument();
  });
});
