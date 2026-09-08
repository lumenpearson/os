import { describe, expect, it } from 'vitest';
import {
  ALBUM_PICKER_WIDTH_MIN,
  INFO_WIDTH_MIN,
  INFO_WITH_SIDEBAR_WIDTH_MIN,
  layoutFor,
  SIDEBAR_WIDTH_MIN,
  SIZE_WIDTH_MIN,
  SORT_WIDTH_MIN,
} from './layout';

const both = { sidebar: true, info: true };
const neither = { sidebar: false, info: false };

describe('layoutFor', () => {
  it('shows the album list once the window is wide enough for it', () => {
    expect(layoutFor(SIDEBAR_WIDTH_MIN - 1, both).sidebar).toBe(false);
    expect(layoutFor(SIDEBAR_WIDTH_MIN, both).sidebar).toBe(true);
  });

  it('never shows the album list the person has switched off', () => {
    expect(layoutFor(1600, { sidebar: false, info: false }).sidebar).toBe(false);
  });

  it('asks for more room for the facts panel when the album list is already there', () => {
    expect(layoutFor(INFO_WITH_SIDEBAR_WIDTH_MIN - 1, both).info).toBe(false);
    expect(layoutFor(INFO_WITH_SIDEBAR_WIDTH_MIN, both).info).toBe(true);
    expect(layoutFor(INFO_WIDTH_MIN, { sidebar: false, info: true }).info).toBe(true);
  });

  it('replaces the album list with a picker rather than losing the albums', () => {
    const narrow = layoutFor(ALBUM_PICKER_WIDTH_MIN, both);
    expect(narrow.sidebar).toBe(false);
    expect(narrow.albumPicker).toBe(true);
  });

  it('never shows the picker and the list at once', () => {
    for (let width = 300; width <= 1600; width += 7) {
      for (const prefs of [both, neither, { sidebar: true, info: false }]) {
        const layout = layoutFor(width, prefs);
        expect(layout.sidebar && layout.albumPicker).toBe(false);
      }
    }
  });

  it('drops the toolbar controls in order as the window narrows', () => {
    const tiny = layoutFor(360, both);
    expect(tiny).toEqual({
      sidebar: false,
      info: false,
      albumPicker: false,
      sortControls: false,
      sizeControl: false,
      panelToggles: false,
    });
    expect(layoutFor(SORT_WIDTH_MIN, both).sortControls).toBe(true);
    expect(layoutFor(SIZE_WIDTH_MIN - 1, both).sizeControl).toBe(false);
    expect(layoutFor(SIZE_WIDTH_MIN, both).sizeControl).toBe(true);
  });

  it('assumes a usable width before the window has been measured', () => {
    expect(layoutFor(0, both).sidebar).toBe(true);
  });
});
