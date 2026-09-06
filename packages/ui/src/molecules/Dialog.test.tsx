import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../atoms/Button';
import { Dialog, DialogProvider, useDialogs } from './Dialog';

/**
 * happy-dom parses styles but never lays anything out: every element reports
 * `clientHeight`, `scrollHeight` and `getBoundingClientRect()` as zero, and the
 * Tailwind sheet is not loaded (`css: false`), so a class carries no computed
 * value here. The size tests below therefore assert on the two things that
 * decide the layout in a real browser — the class list and the inline style —
 * and each test says so in its name.
 */

const containers: HTMLElement[] = [];

/** A stand-in for the window body a dialog is portalled into. */
function windowBody(width = 240, height = 160): HTMLElement {
  const el = document.createElement('div');
  el.className = 'relative';
  el.style.width = `${width}px`;
  el.style.height = `${height}px`;
  document.body.append(el);
  containers.push(el);
  return el;
}

afterEach(() => {
  for (const el of containers.splice(0)) el.remove();
});

/** More text than a 240×160 window can show. */
function longContent() {
  return Array.from({ length: 40 }, (_, i) => <p key={i}>Line {i + 1} of a long message.</p>);
}

function sheetOf(): { sheet: HTMLElement; scrim: HTMLElement; body: HTMLElement } {
  const sheet = screen.getByRole('dialog');
  const scrim = sheet.parentElement;
  if (!scrim) throw new Error('the sheet is not inside a scrim');
  return { sheet, scrim, body: screen.getByTestId('dialog-body') };
}

const VIEWPORT_UNIT = /\d(?:vh|vw|svh|lvh|dvh|svw|lvw|dvw)\b/;

describe('Dialog sizes itself from the window it belongs to', () => {
  it('renders inside the container it was given and covers only that box', () => {
    const container = windowBody();
    render(
      <Dialog open onClose={vi.fn()} title="Save changes" container={container}>
        {longContent()}
      </Dialog>,
    );
    const { sheet, scrim } = sheetOf();
    expect(container.contains(sheet)).toBe(true);
    expect(scrim.classList.contains('absolute')).toBe(true);
    expect(scrim.classList.contains('inset-0')).toBe(true);
    expect(scrim.classList.contains('fixed')).toBe(false);
  });

  it('falls back to a viewport-covering scrim only when there is no container', () => {
    render(
      <Dialog open onClose={vi.fn()} title="Save changes">
        Body
      </Dialog>,
    );
    const { scrim } = sheetOf();
    expect(scrim.classList.contains('fixed')).toBe(true);
  });

  it('caps its height on the container: the sheet is max-h-full inside a padded scrim (class check — happy-dom does not lay out)', () => {
    const container = windowBody(240, 160);
    render(
      <Dialog open onClose={vi.fn()} title="Save changes" container={container}>
        {longContent()}
      </Dialog>,
    );
    const { sheet, scrim } = sheetOf();
    expect(sheet.classList.contains('max-h-full')).toBe(true);
    expect(scrim.classList.contains('p-4')).toBe(true);
  });

  it('caps its width on the container: w-full inside the padded scrim, max-width min(100%, preferred) (inline-style check — happy-dom does not lay out)', () => {
    const container = windowBody(240, 160);
    render(
      <Dialog open onClose={vi.fn()} title="Save changes" container={container} width={420}>
        {longContent()}
      </Dialog>,
    );
    const { sheet } = sheetOf();
    expect(sheet.classList.contains('w-full')).toBe(true);
    expect(sheet.style.maxWidth).toBe('min(100%, 420px)');
    // A bare pixel max-width would win over the container on a narrow window.
    expect(sheet.style.maxWidth).toContain('100%');
    expect(sheet.className).not.toMatch(/\bw-\[/);
  });

  it('takes no size from the viewport: neither the scrim nor the sheet uses vh/vw units', () => {
    const container = windowBody(240, 160);
    render(
      <Dialog open onClose={vi.fn()} title="Save changes" container={container}>
        {longContent()}
      </Dialog>,
    );
    const { sheet, scrim } = sheetOf();
    for (const el of [scrim, sheet]) {
      expect(el.className).not.toMatch(VIEWPORT_UNIT);
      expect(el.getAttribute('style') ?? '').not.toMatch(VIEWPORT_UNIT);
    }
  });
});

describe('Dialog scrolls its body and never its frame', () => {
  it('keeps the frame out of the scroll: the sheet clips, and the only scroll box inside it is the body (class check — happy-dom does not lay out)', () => {
    const container = windowBody(240, 160);
    render(
      <Dialog
        open
        onClose={vi.fn()}
        title="Save changes"
        container={container}
        actions={<Button>OK</Button>}
      >
        {longContent()}
      </Dialog>,
    );
    const { sheet, body } = sheetOf();
    expect(sheet.classList.contains('overflow-hidden')).toBe(true);
    expect(sheet.className).not.toMatch(/overflow-(?:auto|scroll|y-auto|y-scroll)/);
    expect(sheet.classList.contains('lumen-scroll')).toBe(false);
    const scrollers = sheet.querySelectorAll('.lumen-scroll');
    expect(scrollers.length).toBe(1);
    expect(scrollers[0]).toBe(body);
  });

  it('lets the body shrink below its content, which is what turns overflow into a scroll (class check — happy-dom does not lay out)', () => {
    const container = windowBody(240, 160);
    render(
      <Dialog open onClose={vi.fn()} title="Save changes" container={container}>
        {longContent()}
      </Dialog>,
    );
    const { sheet, body } = sheetOf();
    expect(sheet.classList.contains('flex')).toBe(true);
    expect(sheet.classList.contains('flex-col')).toBe(true);
    expect(body.classList.contains('min-h-0')).toBe(true);
    expect(body.classList.contains('flex-1')).toBe(true);
  });

  it('holds the header and the footer still while the body scrolls: both are shrink-0 siblings of the scroll box', () => {
    const container = windowBody(240, 160);
    render(
      <Dialog
        open
        onClose={vi.fn()}
        title="Save changes"
        container={container}
        actions={<Button>OK</Button>}
      >
        {longContent()}
      </Dialog>,
    );
    const { sheet, body } = sheetOf();
    const [header, middle, footer] = Array.from(sheet.children) as HTMLElement[];
    expect(sheet.children.length).toBe(3);
    expect(middle).toBe(body);
    expect(header?.classList.contains('shrink-0')).toBe(true);
    expect(footer?.classList.contains('shrink-0')).toBe(true);
    expect(header?.contains(screen.getByRole('heading', { name: 'Save changes' }))).toBe(true);
    expect(footer?.contains(screen.getByRole('button', { name: 'OK' }))).toBe(true);
  });
});

describe('Dialog keeps its modal behaviour', () => {
  it('closes on Escape and on a press on the scrim, but not on a press inside the sheet', async () => {
    const container = windowBody();
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Save changes" container={container}>
        Body
      </Dialog>,
    );
    const { sheet, scrim, body } = sheetOf();

    await userEvent.click(body);
    await userEvent.click(sheet);
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('ignores Escape and the scrim when persistent, and hides the close button', async () => {
    const container = windowBody();
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Delete file?" container={container} persistent>
        Body
      </Dialog>,
    );
    const { scrim } = sheetOf();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    await userEvent.click(scrim);
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('traps focus: data-autofocus takes focus and Tab stays inside the sheet', async () => {
    const container = windowBody();
    render(
      <>
        <button type="button">outside</button>
        <Dialog
          open
          onClose={vi.fn()}
          title="Save changes"
          container={container}
          actions={
            <Button data-autofocus variant="primary">
              Save
            </Button>
          }
        >
          Body
        </Dialog>
      </>,
    );
    const { sheet } = sheetOf();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }));
    await userEvent.keyboard('{Tab}');
    expect(sheet.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(sheet.contains(document.activeElement)).toBe(true);
  });

  it('keeps the enter animation: the scrim fades, the sheet pops from the top edge', () => {
    const container = windowBody();
    render(
      <Dialog open onClose={vi.fn()} title="Save changes" container={container}>
        Body
      </Dialog>,
    );
    const { sheet, scrim } = sheetOf();
    expect(scrim.classList.contains('lumen-fade-enter')).toBe(true);
    expect(sheet.classList.contains('lumen-pop-enter')).toBe(true);
    expect(sheet.style.getPropertyValue('--lumen-pop-origin')).toBe('top center');
  });

  it('labels the sheet by its title and marks it modal', () => {
    const container = windowBody();
    render(
      <Dialog open onClose={vi.fn()} title="Save changes" container={container}>
        Body
      </Dialog>,
    );
    const sheet = screen.getByRole('dialog', { name: 'Save changes' });
    expect(sheet.getAttribute('aria-modal')).toBe('true');
  });

  it('renders nothing while closed', () => {
    const container = windowBody();
    render(
      <Dialog open={false} onClose={vi.fn()} title="Save changes" container={container}>
        Body
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('useDialogs', () => {
  function Harness({ container }: { container: HTMLElement }) {
    return (
      <DialogProvider container={container}>
        <Asker />
      </DialogProvider>
    );
  }

  function Asker() {
    const dialogs = useDialogs();
    const [answer, setAnswer] = useState('none');
    return (
      <>
        <button
          type="button"
          onClick={() => {
            void dialogs.confirm({ title: 'Delete file?' }).then((ok) => setAnswer(String(ok)));
          }}
        >
          ask
        </button>
        <p>answer: {answer}</p>
      </>
    );
  }

  it('opens a confirm inside the container and resolves with the answer', async () => {
    const container = windowBody();
    render(<Harness container={container} />);
    await userEvent.click(screen.getByRole('button', { name: 'ask' }));
    const sheet = screen.getByRole('dialog', { name: 'Delete file?' });
    expect(container.contains(sheet)).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText('answer: true')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('a confirmation answers with its buttons, and with Escape', () => {
  it('cancels on Escape rather than trapping a keyboard user', async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    render(
      <DialogProvider>
        <Asker onAnswer={(v) => seen.push(v)} />
      </DialogProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    expect(await screen.findByText('Delete the file?')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(seen).toEqual([false]));
  });

  it('offers no close button: Cancel is already the way to say no', async () => {
    const user = userEvent.setup();
    render(
      <DialogProvider>
        <Asker onAnswer={() => {}} />
      </DialogProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await screen.findByText('Delete the file?');
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('is not answered by a stray click on the scrim', async () => {
    const user = userEvent.setup();
    const seen: unknown[] = [];
    const { container } = render(
      <DialogProvider>
        <Asker onAnswer={(v) => seen.push(v)} />
      </DialogProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await screen.findByText('Delete the file?');
    const scrim = container.ownerDocument.querySelector('.lumen-scrim') as HTMLElement;
    fireEvent.pointerDown(scrim);
    expect(seen).toEqual([]);
    expect(screen.getByText('Delete the file?')).toBeInTheDocument();
  });
});

/** A button that raises the confirm, so the test drives the real API. */
function Asker({ onAnswer }: { onAnswer: (value: boolean) => void }) {
  const dialogs = useDialogs();
  return (
    <button
      type="button"
      onClick={async () => {
        onAnswer(await dialogs.confirm({ title: 'Delete the file?', confirmLabel: 'Delete' }));
      }}
    >
      Ask
    </button>
  );
}
