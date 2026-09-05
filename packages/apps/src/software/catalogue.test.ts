import { parseManifest } from '@lumen/kernel';
import { describe, expect, it } from 'vitest';
import {
  availableFromCatalogue,
  CATALOGUE,
  catalogueById,
  catalogueStatus,
  searchCatalogue,
} from './catalogue';
import { buildLibrary } from './library';
import { errorsOf, formatManifest, validateManifest } from './manifest';

describe('the bundled catalogue', () => {
  it('ships five programs with unique ids and names', () => {
    expect(CATALOGUE).toHaveLength(5);
    expect(new Set(CATALOGUE.map((m) => m.id)).size).toBe(5);
    expect(new Set(CATALOGUE.map((m) => m.name)).size).toBe(5);
  });

  it('validates clean, with no warnings to explain away', () => {
    for (const manifest of CATALOGUE) {
      const report = validateManifest(manifest);
      expect(report.issues, `${manifest.id} should have nothing to report`).toEqual([]);
      expect(report.manifest).toEqual(manifest);
    }
  });

  it('is accepted by the kernel parser as written to disk', () => {
    for (const manifest of CATALOGUE) {
      expect(() => parseManifest(formatManifest(manifest))).not.toThrow();
    }
  });

  it('describes each program and gives it a window and keywords', () => {
    for (const m of CATALOGUE) {
      expect(m.description, m.id).toBeTruthy();
      expect(m.version, m.id).toBeTruthy();
      expect(m.window?.width, m.id).toBeGreaterThan(0);
      expect(m.window?.height, m.id).toBeGreaterThan(0);
      expect(m.keywords?.length, m.id).toBeGreaterThan(0);
      expect(m.id.startsWith('user.'), m.id).toBe(true);
    }
  });

  it('carries a real program: markup, a script and the style that draws it', () => {
    for (const m of CATALOGUE) {
      const html = m.html ?? '';
      expect(html.length, m.id).toBeGreaterThan(400);
      expect(html, m.id).toContain('<style>');
      expect(html, m.id).toContain('<script>');
      expect(html, m.id).toContain('lumen.setTitle');
    }
  });

  it('asks for nothing over the network', () => {
    for (const m of CATALOGUE) {
      expect(errorsOf(validateManifest(m).issues), m.id).toEqual([]);
      expect(m.html ?? '', m.id).not.toMatch(/https?:\/\//);
    }
  });
});

describe('lookup', () => {
  it('finds a program by id', () => {
    expect(catalogueById('user.pomodoro')?.name).toBe('Pomodoro Timer');
    expect(catalogueById('user.nothing')).toBeUndefined();
  });

  it('searches name, id, description and keywords', () => {
    expect(searchCatalogue('colour').map((m) => m.id)).toEqual(['user.colour']);
    expect(searchCatalogue('JSON').map((m) => m.id)).toEqual(['user.json']);
    expect(searchCatalogue('minify').map((m) => m.id)).toEqual(['user.json']);
    expect(searchCatalogue('user.').map((m) => m.id)).toHaveLength(5);
    expect(searchCatalogue('   ')).toHaveLength(5);
    expect(searchCatalogue('spreadsheet')).toEqual([]);
  });
});

describe('catalogueStatus', () => {
  const converter = CATALOGUE[0];
  if (!converter) throw new Error('empty catalogue');

  it('is available when nothing on the system claims the id', () => {
    expect(catalogueStatus(converter, [])).toBe('available');
  });

  it('is installed once the manifest is under /Applications', () => {
    const entries = buildLibrary([], [{ manifest: converter, path: '/Applications/x.app' }]);
    expect(catalogueStatus(converter, entries)).toBe('installed');
    expect(availableFromCatalogue(entries)).toHaveLength(4);
  });

  it('is shadowed when a built-in app owns the id', () => {
    const entries = buildLibrary(
      [
        {
          id: converter.id,
          name: 'Converter',
          description: '',
          category: 'utilities',
          icon: () => null,
          component: () => null,
          window: { width: 100, height: 100 },
        },
      ],
      [],
    );
    expect(catalogueStatus(converter, entries)).toBe('shadowed');
  });
});
