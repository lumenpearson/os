import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { motionDuration, usePresence } from './index';

function Subject({ open }: { open: boolean }) {
  const { mounted, leaving } = usePresence(open);
  if (!mounted) return null;
  return <div data-testid="thing" data-leaving={leaving || undefined} />;
}

const thing = () => screen.queryByTestId('thing');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.style.removeProperty('--duration-base');
});

describe('motionDuration', () => {
  it('reads the token the system actually has', () => {
    document.documentElement.style.setProperty('--duration-base', '180ms');
    expect(motionDuration('--duration-base')).toBe(180);
    document.documentElement.style.setProperty('--duration-base', '0.25s');
    expect(motionDuration('--duration-base')).toBe(250);
  });

  it('reads a token nobody set as no time at all', () => {
    expect(motionDuration('--nothing-defines-this')).toBe(0);
  });
});

describe('usePresence', () => {
  it('holds the node for the length of its exit', () => {
    document.documentElement.style.setProperty('--duration-base', '180ms');
    const { rerender } = render(<Subject open />);
    expect(thing()).toBeInTheDocument();

    rerender(<Subject open={false} />);
    // Still there, and saying which way it is going, so the stylesheet can
    // play the reverse of the entrance.
    expect(thing()).toBeInTheDocument();
    expect(thing()).toHaveAttribute('data-leaving', 'true');

    act(() => void vi.advanceTimersByTime(179));
    expect(thing()).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(2));
    expect(thing()).not.toBeInTheDocument();
  });

  it('goes at once when motion is off, so nothing lingers to swallow a click', () => {
    /*
     * Reduce Motion and the per-category switches set the duration tokens to
     * zero. A scrim that stayed for 180 ms of nothing would go on covering
     * the window, which is worse than no animation at all.
     */
    document.documentElement.style.setProperty('--duration-base', '0ms');
    const { rerender } = render(<Subject open />);
    rerender(<Subject open={false} />);
    expect(thing()).not.toBeInTheDocument();
  });

  it('comes straight back if it is reopened mid-exit', () => {
    document.documentElement.style.setProperty('--duration-base', '180ms');
    const { rerender } = render(<Subject open />);
    rerender(<Subject open={false} />);
    act(() => void vi.advanceTimersByTime(90));
    rerender(<Subject open />);
    expect(thing()).toBeInTheDocument();
    expect(thing()).not.toHaveAttribute('data-leaving');
    // And the timer from the abandoned exit does not fire later and take it.
    act(() => void vi.advanceTimersByTime(500));
    expect(thing()).toBeInTheDocument();
  });

  it('starts closed without mounting anything', () => {
    render(<Subject open={false} />);
    expect(thing()).not.toBeInTheDocument();
  });
});
