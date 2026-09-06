import { expect, type Page, test } from '@playwright/test';
import { freeTitleBarSpot, launch, settledBox, setupAndUnlock } from './helpers';

/**
 * The frame budget: a window drag, a menu and a dialog, each without the
 * interface skipping a frame.
 *
 * A single `expect(everyFrame).toBeLessThan(16)` cannot tell a regression from
 * a busy machine, so this is three layers instead.
 *
 * 1. Structural, and this is the gate that means something. Through a drag the
 *    DOM writes are attribute writes on the dragged window and on the cursor
 *    layer's own node — the two things that are meant to move — and on
 *    essentially nothing else. A React commit at pointer rate arrives here as
 *    a write to the window's contents on every frame, so the test fails on
 *    what happened rather than on how long it took.
 * 2. Relative timing. The runner measures its own idle frame rate first and
 *    the gesture is held against that, so a slow machine moves both sides.
 *    Nothing is asserted about the worst frame: shared CI has no GPU, frame
 *    production is not locked to a display, and a co-tenant's spike is one
 *    40–80 ms gap that has nothing to do with this code.
 * 3. The 16.7 ms of the requirement, literally, behind `LUMEN_PERF_STRICT` —
 *    the requirement says "on a developer machine", and that is what this is.
 *    It is the only layer that asserts on the worst frame, so it answers for
 *    the machine as much as for the code: on the shared VM this was written on
 *    it fails about one run in three on a stray 50 ms gap. That is the reason
 *    it is opt-in rather than the reason to loosen it.
 *
 * The gesture is paced by an animation-frame loop inside the page. Driving it
 * with `page.mouse.move` would put a CDP round trip inside the measurement,
 * and Chromium coalesces pointer moves to one per frame anyway, so a scripted
 * drag is one or two frames of real work wearing sixty frames' clothing.
 */

/** Frames kept per sample. Sixty-odd is a second of gesture, at 60 Hz. */
const FRAMES = 72;

/**
 * Frames run before the measurement starts. They pay for spinning up the loop
 * and for anything the page was still settling, neither of which is the steady
 * state the budget is about. The gesture begins on the last of them, so its
 * first frame — the one that opens the menu or the dialog — is measured.
 */
const WARMUP = 10;

/** One frame at 60 Hz, which is the budget the requirement names. */
const BUDGET_MS = 16.7;

/** The menubar menu the menu gesture opens: Paint's, with eight or so items. */
const MENU_ID = 'image';

/**
 * Frames from the trigger that pay for the thing arriving.
 *
 * A menu or a dialog is a React mount and a new layer for the compositor to
 * raster, and no amount of care in the shell makes a mount free: measured
 * here, the dialog costs two or three frames as it comes up. What the budget
 * is about is the frames on either side of that, so the opening is bounded on
 * its own and everything after it is held against the idle rate. A drag has no
 * opening to speak of; it is measured the same way so there is one rule.
 */
const OPENING_FRAMES = 12;

/** Frames the opening may drop. Three seen for the dialog, one for the menu. */
const OPENING_DROPS = 5;

/** How often the kernel ticks its load figures, in ms. See `kernel.ts`. */
const TICK_MS = 2000;

/**
 * Frames of a drag that may write outside the window and the cursor.
 *
 * The interference is a timer, so the allowance is counted in seconds and not
 * in frames: however slowly the runner draws, a sample of `elapsed` ms spans
 * at most that many kernel ticks. Seventy-two frames are 1.2 s on a runner
 * holding 60 Hz — one tick — and 2.4 s on one holding 30, which is two, and a
 * fixed one would simply fail there. A commit at pointer rate is on every
 * frame of the seventy-two either way.
 */
function offenceAllowance(elapsed: number): number {
  return Math.ceil(elapsed / TICK_MS);
}

interface Point {
  x: number;
  y: number;
}

type Gesture = 'idle' | 'drag' | 'menu' | 'dialog';

/** A gesture the requirement names, as opposed to the idle baseline. */
type MeasuredGesture = Exclude<Gesture, 'idle'>;

interface Reading {
  /** Gaps between consecutive animation callbacks, in ms, from the gesture on. */
  deltas: number[];
  /** DOM writes that were neither the dragged window nor the cursor. */
  offences: string[];
  /** How many separate frames carried one, which is what tells a rate from a blip. */
  offendingFrames: number;
  /** Records that added or removed a node, anywhere in the document. */
  rebuilds: number;
  /** Attribute writes on the two nodes that are supposed to move. */
  writes: { window: number; cursor: number };
  /**
   * Frames on which the window's inline transform read differently than on the
   * frame before. Counted without the observer, because the timing layers do
   * not install one and a drag that quietly stopped dragging would otherwise
   * measure an idle page and pass.
   */
  moves: number;
  /** How long the measured frames took in total, in ms. */
  elapsed: number;
}

/**
 * Run one gesture and report the frames it produced.
 *
 * `watch` installs the MutationObserver. It is off for the timing layers on
 * purpose: an observer over the whole document is itself work, and a
 * measurement should not carry its own instrument.
 */
function sample(
  page: Page,
  gesture: Gesture,
  options: { path?: Point[]; watch?: boolean } = {},
): Promise<Reading> {
  return page.evaluate(
    async ({ gesture, path, watch, frames, warmup, menuId }) => {
      const win = document.querySelector<HTMLElement>('[data-testid="window"]');
      const cursor = document.querySelector<HTMLElement>('[data-testid="os-cursor"]');
      if (!win) throw new Error('there is no window on screen to measure');

      const offences: string[] = [];
      const offendingFrames = new Set<number>();
      const writes = { window: 0, cursor: 0 };
      let rebuilds = 0;
      const note = (records: MutationRecord[]) => {
        for (const record of records) {
          if (record.type === 'childList') rebuilds += 1;
          const node = record.target;
          const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
          if (record.type === 'attributes' && el === win) {
            writes.window += 1;
            continue;
          }
          if (record.type === 'attributes' && el === cursor) {
            writes.cursor += 1;
            continue;
          }
          // Enough to name the offender in the failure without printing the page.
          const trail: string[] = [];
          for (let at: Element | null = el; at; at = at.parentElement) {
            const id = at.getAttribute('data-testid');
            trail.unshift(id ? `[${id}]` : at.tagName.toLowerCase());
            if (id || trail.length >= 4) break;
          }
          const what = record.attributeName
            ? `${record.type} ${record.attributeName}`
            : record.type;
          offences.push(`frame ${i - warmup}: ${what} on ${trail.join(' > ')}`);
          offendingFrames.add(i - warmup);
        }
      };
      const observer = watch ? new MutationObserver(note) : null;

      const begin = () => {
        if (gesture === 'menu') {
          const button = document.querySelector<HTMLElement>(`[data-menu-id="${menuId}"]`);
          if (!button) throw new Error(`the ${menuId} menu is not on the bar`);
          button.dispatchEvent(
            new PointerEvent('pointerdown', {
              bubbles: true,
              cancelable: true,
              composed: true,
              pointerId: 1,
              pointerType: 'mouse',
              isPrimary: true,
              button: 0,
              buttons: 1,
            }),
          );
        }
        if (gesture === 'dialog') {
          window.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'C',
              code: 'KeyC',
              ctrlKey: true,
              shiftKey: true,
              bubbles: true,
              cancelable: true,
              composed: true,
            }),
          );
        }
      };

      const deltas: number[] = [];
      const total = warmup + frames;
      let previous = 0;
      let i = 0;
      let moves = 0;
      // Read before the move for this frame is dispatched, so it reports the
      // paint the previous one produced. Inline style, so nothing is flushed.
      let shown = win.style.transform;
      await new Promise<void>((done) => {
        const tick = (now: number) => {
          if (i > warmup) {
            deltas.push(now - previous);
            if (win.style.transform !== shown) {
              shown = win.style.transform;
              moves += 1;
            }
          }
          previous = now;
          if (i >= total) {
            if (observer) note(observer.takeRecords());
            done();
            return;
          }
          if (i === warmup) {
            observer?.observe(document.documentElement, {
              subtree: true,
              childList: true,
              attributes: true,
              characterData: true,
            });
            begin();
          }
          const step = path[i - warmup];
          if (step)
            win.dispatchEvent(
              new PointerEvent('pointermove', {
                bubbles: true,
                cancelable: true,
                composed: true,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true,
                // The button is held down and none changed on this event.
                button: -1,
                buttons: 1,
                clientX: step.x,
                clientY: step.y,
              }),
            );
          i += 1;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      observer?.disconnect();
      return {
        deltas,
        offences,
        offendingFrames: offendingFrames.size,
        rebuilds,
        writes,
        moves,
        elapsed: deltas.reduce((a, b) => a + b, 0),
      };
    },
    {
      gesture,
      path: options.path ?? [],
      watch: options.watch ?? false,
      frames: FRAMES,
      warmup: WARMUP,
      menuId: MENU_ID,
    },
  );
}

/**
 * Waits until the page stops changing on its own.
 *
 * A window arrives with an opening animation and an app mounts behind it, and
 * both are still writing to the document for a while after the element the
 * test waited for is on screen. Measuring across that tail reads a page still
 * being built rather than one being used, so wait it out first — the way
 * `settledBox` waits out a window that has not finished moving.
 */
async function quiet(page: Page, still = 30, limit = 600): Promise<void> {
  const settled = await page.evaluate(
    ({ still, limit }) =>
      new Promise<boolean>((done) => {
        let clean = 0;
        let frames = 0;
        // Drained frame by frame rather than through the callback, so that
        // "nothing changed" is counted against frames and not microtasks.
        const observer = new MutationObserver(() => {});
        observer.observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
        const tick = () => {
          clean = observer.takeRecords().length > 0 ? 0 : clean + 1;
          frames += 1;
          if (clean >= still || frames >= limit) {
            observer.disconnect();
            done(clean >= still);
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { still, limit },
  );
  if (!settled) throw new Error('the page never stopped changing on its own');
}

/** The value at `q` through a sample, by nearest rank. */
function quantile(deltas: readonly number[], q: number): number {
  const sorted = [...deltas].sort((a, b) => a - b);
  const value = sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
  if (value === undefined) throw new Error('no frames were sampled');
  return value;
}

/**
 * The worst frame, defined as `packages/shell/src/perf/frames.ts` defines it
 * for the performance overlay: the longest gap between two animation
 * callbacks, to one decimal. That module is internal to `@lumen/shell`, whose
 * only entry point pulls in React, so this restates the definition rather than
 * importing it — and the two have to be read together if either changes.
 */
function worstFrame(deltas: readonly number[]): number {
  return Math.round(Math.max(...deltas) * 10) / 10;
}

/**
 * Where the pointer goes during the drag: two laps of an ellipse around where
 * it went down, about 16 px at the fastest, which is a hand moving at roughly
 * 950 px/s. It keeps clear of the edges of the screen deliberately — within
 * 12 px of one the window snaps, and the snap preview appearing is a real DOM
 * change that has nothing to do with the frame budget.
 *
 * The lap closes on the last frame rather than the first, so the pointer
 * finishes where it went down and the window is left exactly where it was
 * found. Starting the sweep at `t = 0` instead left the last point 16 px short
 * of the grab point, and a window that walks 16 px left per drag walks the
 * fixed grab point onto a toolbar button: measured, the fifth drag in a row
 * did not move the window at all.
 */
function dragPath(from: Point, frames: number): Point[] {
  return Array.from({ length: frames }, (_, i) => {
    const t = ((i + 1) / frames) * Math.PI * 4;
    return {
      x: Math.round(from.x + Math.sin(t) * 90),
      y: Math.round(from.y + (1 - Math.cos(t)) * 45),
    };
  });
}

/** Presses at `from`, runs `body`, and lets go whatever happens. */
async function dragging<T>(page: Page, from: Point, body: () => Promise<T>): Promise<T> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  try {
    return await body();
  } finally {
    await page.mouse.up();
  }
}

interface Stage {
  /** Performs the gesture once and reports its frames. */
  run: (options?: { watch?: boolean }) => Promise<Reading>;
  /** Puts the screen back, outside any measurement. */
  reset: () => Promise<void>;
}

/** Opens the app a gesture needs and hands back the two ways to work it. */
async function stage(page: Page, gesture: MeasuredGesture): Promise<Stage> {
  await setupAndUnlock(page);
  await launch(page, gesture === 'drag' ? 'Files' : 'Paint');
  const frame = page.getByTestId('window').first();
  await expect(frame).toBeVisible();
  if (gesture !== 'drag') await expect(page.getByTestId('paint-surface')).toBeVisible();
  const box = await settledBox(frame);
  await quiet(page);

  if (gesture === 'drag') {
    const from = await freeTitleBarSpot(page, box);
    const path = dragPath(from, FRAMES);
    const size = page.viewportSize() ?? { width: 0, height: 0 };
    const room = 40;
    const strays = path.some(
      (p) => p.x < room || p.y < room || p.x > size.width - room || p.y > size.height - room,
    );
    expect(strays, 'the drag stays clear of the snap zones at the edges of the screen').toBe(false);
    return {
      run: async (options) => {
        const reading = await dragging(page, from, () =>
          sample(page, 'drag', { path, ...options }),
        );
        // The counterpart of the check the menu and the dialog get below: a
        // pointerdown that lands on a control starts no drag, and the timing
        // layers would then measure an idle page and report it as a gesture
        // inside budget.
        expect(reading.moves, 'the drag moved the window').toBeGreaterThan(FRAMES - 5);
        return reading;
      },
      // The lap closes on the grab point, so letting go leaves the window
      // where it was found and the next drag starts from the same place.
      reset: () => Promise.resolve(),
    };
  }

  const opened =
    gesture === 'menu'
      ? page.locator('[role="menu"]')
      : page.locator('[role="dialog"][aria-modal="true"]');
  return {
    run: async (options) => {
      const reading = await sample(page, gesture, options);
      // Without this the timing below would happily measure a gesture that
      // never happened. The menu button toggles, so it also has to be shut
      // again before the next run or the second run would close it.
      await expect(opened, `the ${gesture} opened`).toHaveCount(1);
      return reading;
    },
    reset: async () => {
      // Escape reaches the dialog, which takes the focus, but not the menu,
      // which does not — so the menu is shut the way it was opened, by its
      // own button, which toggles. Nothing is being measured here, so this
      // one may go the slow way round through the driver.
      if (gesture === 'menu') await page.locator(`[data-menu-id="${MENU_ID}"]`).click();
      else await page.keyboard.press('Escape');
      await expect(opened).toHaveCount(0);
    },
  };
}

/** The gesture twice, keeping the second: the first pays for warming the path. */
async function secondRun(stage: Stage): Promise<Reading> {
  await stage.run();
  await stage.reset();
  const reading = await stage.run();
  await stage.reset();
  return reading;
}

test.describe('frame budget', () => {
  test('a drag writes to the dragged window and the cursor, and to nothing else', async ({
    page,
  }) => {
    const drag = await stage(page, 'drag');
    const reading = await drag.run({ watch: true });

    /*
     * childList is held at zero and nothing is allowed to explain it away: a
     * window rebuilt under the pointer is the defect `windows.spec.ts` already
     * watches for on a two-second tick, and mid-drag there is no excuse for it
     * at all. Note what this does not catch on its own — a re-render that
     * leaves the tree the same shape writes attributes, not children — which
     * is the assertion below.
     *
     * The rest is judged by rate rather than by count, because one write on
     * one frame is not a rate. The kernel ticks its load figures every two
     * seconds and that renders every window frame; where a window holds a
     * controlled `<input>` — the search box in Files, here — React re-writes
     * its `name` and `type` on the way through, and a drag longer than two
     * seconds will see it once. The same list on sixty frames instead of one
     * is the regression, and each entry names the frame it landed on.
     */
    expect(reading.rebuilds, 'nothing is added to or removed from the page mid-drag').toBe(0);
    expect(
      reading.offendingFrames,
      `frames writing outside the window and the cursor: ${reading.offences.join('; ')}`,
    ).toBeLessThanOrEqual(offenceAllowance(reading.elapsed));

    // And it was a real drag: both nodes were written on essentially every
    // frame — 72 of 72 for the window, three times that for the cursor, which
    // sets a transform, a shape and a pressed flag. Without this an inert
    // gesture would pass the assertions above by touching nothing at all.
    expect(reading.writes.window, 'the window moved on every frame').toBeGreaterThan(FRAMES - 5);
    expect(reading.writes.cursor, 'the cursor followed on every frame').toBeGreaterThan(FRAMES - 5);
  });

  for (const gesture of ['drag', 'menu', 'dialog'] as const) {
    test(`${gesture}: frames stay at the rate the runner is already holding`, async ({ page }) => {
      const staged = await stage(page, gesture);
      const idle = await sample(page, 'idle');
      const reading = await secondRun(staged);

      const idleMedian = quantile(idle.deltas, 0.5);
      const idleP95 = quantile(idle.deltas, 0.95);
      const opening = reading.deltas.slice(0, OPENING_FRAMES);
      const steady = reading.deltas.slice(OPENING_FRAMES);
      const dropped = (frames: number[]) => frames.filter((d) => d > idleMedian * 2).length;
      const idleAt = `the ${idleMedian.toFixed(1)} ms this runner idles at`;

      expect(
        dropped(opening),
        `frames dropped bringing the ${gesture} up, against ${idleAt}`,
      ).toBeLessThanOrEqual(OPENING_DROPS);
      expect(
        quantile(steady, 0.5),
        `median frame once the ${gesture} is running, against ${idleAt}`,
      ).toBeLessThan(idleMedian * 1.5);
      expect(
        quantile(steady, 0.95),
        `95th frame, against the ${idleP95.toFixed(1)} ms idle 95th`,
      ).toBeLessThan(idleP95 * 2);
      // Two, not zero: a shared runner drops the odd frame for reasons of its
      // own, which is also why nothing here is asserted about the worst frame.
      expect(dropped(steady), `frames over twice ${idleAt}`).toBeLessThanOrEqual(2);
    });

    test(`${gesture}: every frame fits the ${BUDGET_MS} ms budget`, async ({ page }) => {
      test.skip(
        !process.env.LUMEN_PERF_STRICT,
        `the requirement's own number, which wants a machine kept for it: LUMEN_PERF_STRICT=1 pnpm --filter @lumen/web exec playwright test e2e/perf.spec.ts`,
      );
      const staged = await stage(page, gesture);
      const steady = (await secondRun(staged)).deltas.slice(OPENING_FRAMES);

      // The absolute form of the layer above, and the one place the worst
      // frame is asserted on — which is what the gate buys. At 60 Hz the
      // callback comes every 16.7 ms, so a gap of two budgets is a frame that
      // never arrived.
      expect(worstFrame(steady), 'no frame was skipped').toBeLessThan(BUDGET_MS * 2);
      expect(quantile(steady, 0.5), 'the typical frame is one budget').toBeLessThan(
        BUDGET_MS * 1.2,
      );
    });
  }
});
