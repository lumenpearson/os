import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeparting } from './index';

function List({ ids }: { ids: string[] }) {
  const shown = useDeparting(
    ids.map((id) => ({ id })),
    (n) => n.id,
  );
  return (
    <ul data-testid="list">
      {shown.map(({ key, present }) => (
        <li key={key} data-testid={`row-${key}`} data-leaving={present ? undefined : 'true'}>
          {key}
        </li>
      ))}
    </ul>
  );
}

const rows = () =>
  [...screen.getByTestId('list').children].map((el) => el.getAttribute('data-testid'));
const row = (id: string) => screen.queryByTestId(`row-${id}`);

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.style.setProperty('--duration-panel', '180ms');
});

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.style.removeProperty('--duration-panel');
});

describe('useDeparting', () => {
  it('draws what is in the list', () => {
    render(<List ids={['a', 'b']} />);
    expect(rows()).toEqual(['row-a', 'row-b']);
  });

  it('keeps an item that has left, and says it is leaving', () => {
    const { rerender } = render(<List ids={['a', 'b']} />);
    rerender(<List ids={['a']} />);
    expect(row('b')).toBeInTheDocument();
    expect(row('b')).toHaveAttribute('data-leaving', 'true');
  });

  it('never blinks it out and back: it is held from the very first render without it', () => {
    /*
     * The regression this guards. Deciding what has left in an effect means
     * deciding it after the paint, so the row would be gone for one frame and
     * then reappear to play an exit — a flicker where there was none before.
     */
    const { rerender } = render(<List ids={['a', 'b']} />);
    rerender(<List ids={['a']} />);
    expect(row('b')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(0));
    expect(row('b')).toBeInTheDocument();
  });

  it('takes it away once the exit has run', () => {
    const { rerender } = render(<List ids={['a', 'b']} />);
    rerender(<List ids={['a']} />);
    act(() => void vi.advanceTimersByTime(179));
    expect(row('b')).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(2));
    expect(row('b')).not.toBeInTheDocument();
  });

  it('leaves it where it was, rather than moving it to the end', () => {
    const { rerender } = render(<List ids={['a', 'b', 'c']} />);
    rerender(<List ids={['a', 'c']} />);
    expect(rows()).toEqual(['row-a', 'row-b', 'row-c']);
  });

  it('stops leaving if it comes back, and is not taken away later', () => {
    const { rerender } = render(<List ids={['a', 'b']} />);
    rerender(<List ids={['a']} />);
    act(() => void vi.advanceTimersByTime(90));
    rerender(<List ids={['a', 'b']} />);
    expect(row('b')).not.toHaveAttribute('data-leaving');
    act(() => void vi.advanceTimersByTime(500));
    expect(row('b')).toBeInTheDocument();
  });

  it('holds nothing back when motion is off', () => {
    document.documentElement.style.setProperty('--duration-panel', '0ms');
    const { rerender } = render(<List ids={['a', 'b']} />);
    rerender(<List ids={['a']} />);
    expect(row('b')).not.toBeInTheDocument();
  });

  it('survives a re-render that changes nothing, without restarting the exit', () => {
    const { rerender } = render(<List ids={['a', 'b']} />);
    rerender(<List ids={['a']} />);
    act(() => void vi.advanceTimersByTime(100));
    rerender(<List ids={['a']} />);
    act(() => void vi.advanceTimersByTime(100));
    expect(row('b')).not.toBeInTheDocument();
  });

  it('holds several at once', () => {
    const { rerender } = render(<List ids={['a', 'b', 'c']} />);
    rerender(<List ids={['b']} />);
    expect(rows()).toEqual(['row-a', 'row-b', 'row-c']);
    act(() => void vi.advanceTimersByTime(200));
    expect(rows()).toEqual(['row-b']);
  });
});
