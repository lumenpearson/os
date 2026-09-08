/**
 * A fixed-capacity ring buffer. The log runs for as long as the session does,
 * so the viewer keeps a bounded window of it: pushing past the capacity drops
 * the oldest record and the memory never grows.
 */
export class RingBuffer<T> {
  readonly capacity: number;
  private readonly slots: Array<T | undefined>;
  /** Index of the oldest record. */
  private head = 0;
  private length = 0;
  private evicted = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`buffer capacity must be a positive integer, got ${capacity}`);
    }
    this.capacity = capacity;
    this.slots = new Array<T | undefined>(capacity).fill(undefined);
  }

  get size(): number {
    return this.length;
  }

  /** Records dropped to make room since the last clear. */
  get dropped(): number {
    return this.evicted;
  }

  push(value: T): void {
    this.slots[(this.head + this.length) % this.capacity] = value;
    if (this.length < this.capacity) {
      this.length += 1;
    } else {
      this.head = (this.head + 1) % this.capacity;
      this.evicted += 1;
    }
  }

  /** Oldest is 0. Out of range reads are undefined, never a wrapped slot. */
  at(index: number): T | undefined {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) return undefined;
    return this.slots[(this.head + index) % this.capacity];
  }

  /** Oldest to newest. */
  *[Symbol.iterator](): IterableIterator<T> {
    for (let i = 0; i < this.length; i++) {
      const value = this.slots[(this.head + i) % this.capacity];
      if (value !== undefined) yield value;
    }
  }

  /** A snapshot, oldest first. */
  toArray(): T[] {
    return [...this];
  }

  clear(): void {
    this.slots.fill(undefined);
    this.head = 0;
    this.length = 0;
    this.evicted = 0;
  }
}
