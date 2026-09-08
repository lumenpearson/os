import { describe, expect, it } from 'vitest';
import { type LoadReading, stepLoad, systemLoad, targetCpu, targetMemory } from './load';

const settled = { windows: 1, background: false, age: 60_000 };
const rest: LoadReading = { cpu: 0, memory: 26 * 1024 * 1024 };

describe('targetCpu', () => {
  it('costs more with every window the process holds', () => {
    const one = targetCpu({ ...settled, windows: 1 }, 0);
    const three = targetCpu({ ...settled, windows: 3 }, 0);
    const six = targetCpu({ ...settled, windows: 6 }, 0);
    expect(three).toBeGreaterThan(one);
    expect(six).toBeGreaterThan(three);
  });

  it('costs almost nothing in the background', () => {
    expect(targetCpu({ windows: 0, background: true, age: 60_000 }, 0)).toBeLessThan(1);
  });

  it('is highest at the moment a process starts and tails off', () => {
    const cold = targetCpu({ ...settled, age: 0 }, 0);
    const warming = targetCpu({ ...settled, age: 2_000 }, 0);
    const warm = targetCpu({ ...settled, age: 30_000 }, 0);
    expect(cold).toBeGreaterThan(warming);
    expect(warming).toBeGreaterThan(warm);
  });
});

describe('targetMemory', () => {
  it('grows with the windows and never falls under a floor', () => {
    expect(targetMemory({ ...settled, windows: 4 }, 0.5)).toBeGreaterThan(
      targetMemory({ ...settled, windows: 1 }, 0.5),
    );
    expect(targetMemory({ windows: 0, background: true, age: 0 }, 0)).toBeGreaterThanOrEqual(
      8 * 1024 * 1024,
    );
  });
});

describe('stepLoad', () => {
  it('eases toward the target rather than jumping to it', () => {
    const first = stepLoad(rest, settled, 1_000, 0);
    expect(first.cpu).toBeGreaterThan(0);
    expect(first.cpu).toBeLessThan(targetCpu(settled, 0));
  });

  it('gets there in the end, and stays', () => {
    let reading = rest;
    for (let i = 0; i < 40; i++) reading = stepLoad(reading, settled, 1_000, 0);
    expect(reading.cpu).toBeCloseTo(targetCpu(settled, 0), 1);
    const again = stepLoad(reading, settled, 1_000, 0);
    expect(again.cpu).toBeCloseTo(reading.cpu, 1);
  });

  it('measures in real time, so a long gap lands where a hundred short ones would', () => {
    let stepped = rest;
    for (let i = 0; i < 20; i++) stepped = stepLoad(stepped, settled, 500, 0);
    const jumped = stepLoad(rest, settled, 10_000, 0);
    expect(jumped.cpu).toBeCloseTo(stepped.cpu, 0);
  });

  it('stays inside its bounds however hard it is pushed', () => {
    const busy = stepLoad({ cpu: 99, memory: rest.memory }, { ...settled, windows: 40 }, 60_000, 1);
    expect(busy.cpu).toBeLessThanOrEqual(100);
    const idle = stepLoad({ cpu: 0.1, memory: 1 }, { ...settled, background: true }, 60_000, 0);
    expect(idle.cpu).toBeGreaterThanOrEqual(0);
    expect(idle.memory).toBeGreaterThanOrEqual(8 * 1024 * 1024);
  });
});

describe('systemLoad', () => {
  it('adds up what everything is doing, services included', () => {
    const readings = [
      { cpu: 4, memory: 100 },
      { cpu: 6, memory: 200 },
    ];
    const none = systemLoad(readings, 0, 1_000);
    const some = systemLoad(readings, 20, 1_000);
    expect(none.cpu).toBe(10);
    expect(some.cpu).toBeGreaterThan(none.cpu);
    expect(some.memory).toBeGreaterThan(none.memory);
  });

  it('never reports more than the machine has', () => {
    const busy = Array.from({ length: 30 }, () => ({ cpu: 9, memory: 0 }));
    expect(systemLoad(busy, 100, 1_000).cpu).toBe(100);
  });

  it('reports the share of memory in use, and nothing when the total is unknown', () => {
    expect(systemLoad([{ cpu: 0, memory: 250 }], 0, 1_000).memoryShare).toBeCloseTo(0.25, 3);
    expect(systemLoad([{ cpu: 0, memory: 250 }], 0, 0).memoryShare).toBe(0);
  });
});
