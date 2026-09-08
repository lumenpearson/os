import { describe, expect, it } from 'vitest';
import {
  DIFF_COLUMNS_AT,
  LABELS_AT,
  layoutFor,
  paneLayoutFor,
  SIDEBAR_AT,
  SPLIT_AT,
} from './layout';

describe('layoutFor', () => {
  it('folds the sidebar away below its threshold', () => {
    expect(layoutFor(SIDEBAR_AT).sidebar).toBe(true);
    expect(layoutFor(SIDEBAR_AT - 1).sidebar).toBe(false);
  });

  it('drops the words from toolbar buttons on a narrow window', () => {
    expect(layoutFor(LABELS_AT).labels).toBe(true);
    expect(layoutFor(LABELS_AT - 1).labels).toBe(false);
  });

  it('keeps everything at the smallest window the app declares', () => {
    expect(layoutFor(400)).toEqual({ sidebar: false, labels: false });
  });

  it('keeps everything at a wide window', () => {
    expect(layoutFor(3840)).toEqual({ sidebar: true, labels: true });
  });
});

describe('paneLayoutFor', () => {
  it('splits input from output only when the pane is wide enough', () => {
    expect(paneLayoutFor(SPLIT_AT).split).toBe(true);
    expect(paneLayoutFor(SPLIT_AT - 1).split).toBe(false);
  });

  it('gives the diff two columns only when the pane is wide enough', () => {
    expect(paneLayoutFor(DIFF_COLUMNS_AT).columns).toBe(true);
    expect(paneLayoutFor(DIFF_COLUMNS_AT - 1).columns).toBe(false);
  });

  it('stacks everything in a pane with no measured width yet', () => {
    expect(paneLayoutFor(0)).toEqual({ split: false, columns: false });
  });
});
