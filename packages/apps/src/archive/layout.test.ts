import { describe, expect, it } from 'vitest';
import { columnTemplate, layoutFor, MIN_NAME_WIDTH } from './layout';

const columnsAt = (width: number, showDetails = false) =>
  layoutFor(width, { showDetails }).columns.join(' ');

describe('layoutFor', () => {
  it('keeps the name and the size in the narrowest window the app allows', () => {
    expect(columnsAt(380)).toBe('name size');
  });

  it('adds the other columns as the window grows', () => {
    expect(columnsAt(420)).toBe('name size packed');
    expect(columnsAt(520)).toBe('name size packed ratio');
    expect(columnsAt(580)).toBe('name size packed ratio modified');
  });

  it('adds a column exactly at its step, not one pixel before', () => {
    expect(columnsAt(419)).toBe('name size');
    expect(columnsAt(519)).toBe('name size packed');
    expect(columnsAt(579)).toBe('name size packed ratio');
  });

  it('shows every column in the window the app opens at', () => {
    expect(layoutFor(820, { showDetails: true }).columns).toHaveLength(5);
    expect(layoutFor(820, { showDetails: true }).showDetails).toBe(true);
  });

  it('counts the details panel against the space the table has', () => {
    expect(columnsAt(760, true)).toBe('name size packed ratio');
    expect(columnsAt(760, false)).toBe('name size packed ratio modified');
  });

  it('folds the details panel away in a window with no room for it', () => {
    expect(layoutFor(759, { showDetails: true }).showDetails).toBe(false);
    expect(layoutFor(760, { showDetails: true }).showDetails).toBe(true);
    expect(layoutFor(1400, { showDetails: false }).showDetails).toBe(false);
  });

  it('gives the table the whole window once the panel is folded away', () => {
    expect(columnsAt(759, true)).toBe('name size packed ratio modified');
  });

  it('compacts the toolbar in a narrow window only', () => {
    expect(layoutFor(500, { showDetails: false }).compactToolbar).toBe(true);
    expect(layoutFor(620, { showDetails: false }).compactToolbar).toBe(false);
  });

  it('reports a minimum the table can scroll inside', () => {
    expect(layoutFor(380, { showDetails: false }).minTableWidth).toBe(MIN_NAME_WIDTH + 88);
    expect(layoutFor(1200, { showDetails: false }).minTableWidth).toBe(
      MIN_NAME_WIDTH + 88 + 88 + 64 + 148,
    );
  });

  it('holds up at 4K and at zero, where the size has not been measured yet', () => {
    expect(layoutFor(3840, { showDetails: true }).columns).toHaveLength(5);
    expect(layoutFor(0, { showDetails: true }).columns).toEqual(['name', 'size']);
    expect(layoutFor(0, { showDetails: true }).showDetails).toBe(false);
  });
});

describe('columnTemplate', () => {
  it('gives the name column the slack and the rest fixed tracks', () => {
    expect(columnTemplate(['name', 'size'])).toBe(`minmax(${MIN_NAME_WIDTH}px, 1fr) 88px`);
  });

  it('lines the header up with the rows, column for column', () => {
    const columns = layoutFor(1000, { showDetails: false }).columns;
    expect(columnTemplate(columns).split(' ')).toHaveLength(6);
  });
});
