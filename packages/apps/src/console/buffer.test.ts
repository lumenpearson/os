import { describe, expect, it } from 'vitest';
import { RingBuffer } from './buffer';

function filled(capacity: number, count: number): RingBuffer<number> {
  const b = new RingBuffer<number>(capacity);
  for (let i = 1; i <= count; i++) b.push(i);
  return b;
}

describe('RingBuffer', () => {
  it('rejects a capacity that is not a positive integer', () => {
    expect(() => new RingBuffer<number>(0)).toThrow(RangeError);
    expect(() => new RingBuffer<number>(-3)).toThrow(RangeError);
    expect(() => new RingBuffer<number>(1.5)).toThrow(RangeError);
    expect(() => new RingBuffer<number>(Number.NaN)).toThrow(RangeError);
  });

  it('starts empty', () => {
    const b = new RingBuffer<string>(4);
    expect(b.size).toBe(0);
    expect(b.dropped).toBe(0);
    expect(b.toArray()).toEqual([]);
    expect(b.at(0)).toBeUndefined();
  });

  it('reads back oldest first while it is filling', () => {
    const b = filled(4, 3);
    expect(b.size).toBe(3);
    expect(b.toArray()).toEqual([1, 2, 3]);
    expect(b.at(0)).toBe(1);
    expect(b.at(2)).toBe(3);
    expect(b.at(3)).toBeUndefined();
  });

  it('never grows past its capacity', () => {
    const b = filled(3, 10_000);
    expect(b.size).toBe(3);
    expect(b.capacity).toBe(3);
    expect(b.toArray()).toHaveLength(3);
  });

  it('keeps the order through wraparound and counts what it dropped', () => {
    const b = filled(3, 5);
    expect(b.toArray()).toEqual([3, 4, 5]);
    expect(b.dropped).toBe(2);
    b.push(6);
    expect(b.toArray()).toEqual([4, 5, 6]);
    expect(b.at(0)).toBe(4);
    expect(b.at(2)).toBe(6);
    expect(b.dropped).toBe(3);
  });

  it('iterates oldest to newest after many wraparounds', () => {
    const b = filled(4, 103);
    expect([...b]).toEqual([100, 101, 102, 103]);
  });

  it('rejects an index that is not a whole number', () => {
    const b = filled(4, 4);
    expect(b.at(-1)).toBeUndefined();
    expect(b.at(1.5)).toBeUndefined();
  });

  it('holds one record when the capacity is one', () => {
    const b = filled(1, 3);
    expect(b.toArray()).toEqual([3]);
    expect(b.dropped).toBe(2);
  });

  it('clears back to empty and forgets the drop count', () => {
    const b = filled(3, 9);
    b.clear();
    expect(b.size).toBe(0);
    expect(b.dropped).toBe(0);
    expect(b.toArray()).toEqual([]);
    b.push(42);
    expect(b.toArray()).toEqual([42]);
  });

  it('holds objects without copying them', () => {
    const b = new RingBuffer<{ id: number }>(2);
    const first = { id: 1 };
    b.push(first);
    expect(b.at(0)).toBe(first);
  });
});
