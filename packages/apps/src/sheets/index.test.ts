import { describe, expect, it } from 'vitest';
import definition from './index';

describe('the Sheets app definition', () => {
  it('identifies itself', () => {
    expect(definition.id).toBe('lumen.sheets');
    expect(definition.name).toBe('Sheets');
    expect(definition.description).toBe('Spreadsheets with formulas, ranges and CSV import.');
    expect(definition.category).toBe('office');
  });

  it('opens at a workable size', () => {
    expect(definition.window).toEqual({ width: 960, height: 620, minWidth: 480, minHeight: 300 });
  });

  it('claims the spreadsheet file types', () => {
    expect(definition.fileAssociations).toEqual([
      { extensions: ['.lsd'], role: 'editor', priority: 2 },
      { extensions: ['.csv', '.tsv'], role: 'editor', priority: 1 },
    ]);
  });

  it('is findable by keyword', () => {
    expect(definition.keywords).toEqual(['spreadsheet', 'excel', 'table', 'formula']);
  });

  it('loads its component lazily, so the definition stays cheap at boot', () => {
    expect(typeof definition.component).toBe('object');
    expect(definition.component).toHaveProperty('_payload');
  });
});
