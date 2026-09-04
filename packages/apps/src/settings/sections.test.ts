import { describe, expect, it } from 'vitest';
import {
  isSectionId,
  SECTION_IDS,
  SETTINGS_ROWS,
  SETTINGS_SECTIONS,
  SIDEBAR_GROUPS,
  searchSettings,
} from './sections';

describe('SETTINGS_SECTIONS', () => {
  it('lists the eighteen sections in display order', () => {
    expect(SECTION_IDS).toEqual([
      'general',
      'appearance',
      'wallpaper',
      'taskbar',
      'display',
      'security',
      'notifications',
      'sound',
      'network',
      'keyboard',
      'cursor',
      'region',
      'files',
      'storage',
      'privacy',
      'power',
      'reset',
      'about',
    ]);
    expect(SETTINGS_SECTIONS.every((s) => s.label.length > 0 && s.keywords.length > 0)).toBe(true);
  });

  it('places every section in exactly one sidebar group', () => {
    const grouped = SIDEBAR_GROUPS.flat();
    expect([...grouped].sort()).toEqual([...SECTION_IDS].sort());
  });

  it('indexes rows with unique ids that belong to a known section', () => {
    const ids = new Set<string>();
    for (const r of SETTINGS_ROWS) {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(isSectionId(r.section)).toBe(true);
      expect(r.id.startsWith(`${r.section}.`)).toBe(true);
    }
    for (const id of SECTION_IDS) expect(SETTINGS_ROWS.some((r) => r.section === id)).toBe(true);
  });

  it('recognises section ids and rejects anything else', () => {
    expect(isSectionId('about')).toBe(true);
    expect(isSectionId('nope')).toBe(false);
    expect(isSectionId(undefined)).toBe(false);
  });
});

describe('searchSettings', () => {
  it('returns every section in order for an empty query', () => {
    const r = searchSettings('   ');
    expect(r.map((x) => x.section.id)).toEqual(SECTION_IDS);
    expect(r.every((x) => x.rows.length === 0)).toBe(true);
  });

  it('ranks a label match above a keyword match', () => {
    // "screen" is in the Security label and in Display's keywords
    const ids = searchSettings('screen').map((r) => r.section.id);
    expect(ids[0]).toBe('security');
    expect(ids).toContain('display');
    expect(ids.indexOf('security')).toBeLessThan(ids.indexOf('display'));
  });

  it('ranks a keyword match above a row-only match', () => {
    // "clock": Taskbar has row matches only; Security has row matches too;
    // no section label contains it, so keyword owners lead
    const r = searchSettings('trash');
    const ids = r.map((x) => x.section.id);
    // Files and Storage both carry "trash" as a keyword; Storage also has a row
    expect(ids.slice(0, 2).sort()).toEqual(['files', 'storage']);
  });

  it('ranks a label prefix above a label substring', () => {
    const ids = searchSettings('a').map((r) => r.section.id);
    // Appearance and About start with "a"; Wallpaper only contains it
    expect(ids.indexOf('appearance')).toBeLessThan(ids.indexOf('wallpaper'));
    expect(ids.indexOf('about')).toBeLessThan(ids.indexOf('wallpaper'));
  });

  it('keeps natural order between equal scores', () => {
    const ids = searchSettings('show').map((r) => r.section.id);
    const taskbar = ids.indexOf('taskbar');
    const files = ids.indexOf('files');
    expect(taskbar).toBeGreaterThanOrEqual(0);
    expect(files).toBeGreaterThanOrEqual(0);
    expect(taskbar).toBeLessThan(files);
  });

  it('reports the matching rows of a section', () => {
    const r = searchSettings('dark');
    const appearance = r.find((x) => x.section.id === 'appearance');
    expect(appearance?.rows).toContain('appearance.theme');
    const cursor = r.find((x) => x.section.id === 'cursor');
    expect(cursor?.rows).toContain('cursor.color');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(searchSettings('  DaRk ')).toEqual(searchSettings('dark'));
  });

  it('returns nothing for a query that matches no section', () => {
    expect(searchSettings('zzzzzz')).toEqual([]);
  });
});
