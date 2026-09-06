/**
 * The player's chrome. Whether it is up or down is a piece of state a pointer
 * crossing the stage would otherwise write on every event, so `wake` keeps a
 * ref beside it and only sets state on the edge. These cover the part of that
 * which can be wrong: the ref has to stay in step with the state, and the
 * countdown has to start again on every move, not only on the first.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Deck } from './deck';
import { Presenter } from './Presenter';

const DECK: Deck = {
  version: 1,
  title: 'Quarter Review',
  slides: [
    { id: 's1', layout: 'title', title: 'Quarter Review' },
    { id: 's2', layout: 'bullets', title: 'Where we are', bullets: ['One'] },
  ],
};

/** The row the fade is applied to; it either takes pointers or it does not. */
const controls = () =>
  screen.getByRole('button', { name: 'Previous slide' }).parentElement as HTMLElement;

const showing = () => !controls().className.includes('opacity-0');

const stage = () => screen.getByRole('region', { name: /Presenting slide/ });

function wait(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function mount() {
  render(<Presenter deck={DECK} index={0} onIndex={() => {}} onExit={() => {}} />);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the chrome over a running deck', () => {
  it('withdraws once the deck is left alone', () => {
    mount();
    expect(showing()).toBe(true);

    wait(2000);
    expect(showing()).toBe(false);
  });

  it('comes back on a pointer move, and withdraws again after it', () => {
    mount();
    wait(2000);
    expect(showing()).toBe(false);

    fireEvent.pointerMove(stage());
    expect(showing()).toBe(true);

    wait(2000);
    expect(showing()).toBe(false);
  });

  it('starts the countdown again on every move, not only the first', () => {
    mount();

    // Each move lands before the chrome would have gone, so it never does.
    for (let i = 0; i < 3; i += 1) {
      wait(1500);
      expect(showing()).toBe(true);
      fireEvent.pointerMove(stage());
    }

    wait(2000);
    expect(showing()).toBe(false);
  });
});
