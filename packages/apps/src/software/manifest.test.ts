import { parseManifest } from '@lumen/kernel';
import { describe, expect, it } from 'vitest';
import {
  describeCapabilities,
  errorsOf,
  formatManifest,
  parseManifestText,
  validateManifest,
  warningsOf,
} from './manifest';

const VALID = {
  id: 'user.example',
  name: 'Example',
  description: 'An example program.',
  version: '1.2.0',
  category: 'utilities',
  keywords: ['example', 'demo'],
  window: { width: 420, height: 320, minWidth: 200, minHeight: 160, titleBar: 'default' },
  html: '<h1>Hello</h1>',
};

const fields = (issues: ReadonlyArray<{ field: string }>) => issues.map((i) => i.field);
const messageFor = (issues: ReadonlyArray<{ field: string; message: string }>, field: string) =>
  issues.find((i) => i.field === field)?.message ?? '';

describe('parseManifestText', () => {
  it('reports malformed JSON as one error instead of throwing', () => {
    const report = parseManifestText('{ "id": "user.x", ');
    expect(report.manifest).toBeNull();
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]?.level).toBe('error');
    expect(report.issues[0]?.message).toMatch(/^Not valid JSON/);
  });

  it('says there is nothing to read for empty input', () => {
    expect(parseManifestText('   ').issues[0]?.message).toBe('There is nothing to read.');
  });

  it('refuses anything that is not a JSON object', () => {
    expect(parseManifestText('[1, 2]').issues[0]?.message).toContain('an array');
    expect(parseManifestText('42').issues[0]?.message).toContain('a number');
    expect(parseManifestText('null').issues[0]?.message).toContain('null');
  });
});

describe('required fields', () => {
  it('collects every missing field rather than stopping at the first', () => {
    const report = validateManifest({});
    expect(fields(errorsOf(report.issues))).toEqual(['id', 'name', '']);
    expect(report.manifest).toBeNull();
  });

  it('names the id rule when the id has characters the kernel rejects', () => {
    const report = validateManifest({ ...VALID, id: 'user example!' });
    expect(messageFor(report.issues, 'id')).toContain('2 to 64 characters');
  });

  it('rejects a name that leaves nothing for a file name', () => {
    const report = validateManifest({ ...VALID, name: '///' });
    expect(messageFor(report.issues, 'name')).toContain('one character');
  });

  it('rejects a manifest with nothing to run', () => {
    const { html, ...rest } = VALID;
    expect(html).toBeTruthy();
    const report = validateManifest(rest);
    expect(messageFor(report.issues, '')).toContain('"alias", "html" or "script"');
  });

  it('rejects an entry point that is present but empty', () => {
    expect(messageFor(validateManifest({ ...VALID, html: '   ' }).issues, 'html')).toContain(
      'Empty',
    );
  });
});

describe('wrong types', () => {
  it('names the field and what was found', () => {
    const report = validateManifest({
      id: 7,
      name: 'Example',
      description: [],
      version: 3,
      icon: 1,
      html: 12,
      window: 'big',
      category: 9,
      keywords: 'demo',
    });
    const errors = errorsOf(report.issues);
    expect(fields(errors)).toEqual([
      'id',
      'description',
      'version',
      'icon',
      'html',
      'window',
      'category',
      'keywords',
    ]);
    expect(messageFor(errors, 'id')).toBe('Must be a string; this is a number.');
    expect(messageFor(errors, 'description')).toBe('Must be a string; this is an array.');
    expect(messageFor(errors, 'window')).toContain('this is a string');
  });

  it('checks each keyword', () => {
    const report = validateManifest({ ...VALID, keywords: ['ok', 4] });
    expect(fields(errorsOf(report.issues))).toEqual(['keywords[1]']);
  });

  it('checks window numbers, flags and the title bar style', () => {
    const report = validateManifest({
      ...VALID,
      window: { width: 'wide', height: -20, resizable: 'yes', titleBar: 'floating' },
    });
    const errors = errorsOf(report.issues);
    expect(fields(errors)).toEqual([
      'window.width',
      'window.height',
      'window.resizable',
      'window.titleBar',
    ]);
    expect(messageFor(errors, 'window.height')).toBe('Must be greater than zero.');
  });

  it('allows a negative window position', () => {
    const report = validateManifest({ ...VALID, window: { x: -40, y: 0 } });
    expect(errorsOf(report.issues)).toHaveLength(0);
    expect(report.manifest?.window).toEqual({ x: -40, y: 0 });
  });

  it('rejects a category outside the kernel list', () => {
    expect(
      messageFor(validateManifest({ ...VALID, category: 'productivity' }).issues, 'category'),
    ).toContain('Must be one of');
  });

  it('rejects an alias without an appId', () => {
    const report = validateManifest({ id: 'user.a', name: 'A', alias: { args: {} } });
    expect(fields(errorsOf(report.issues))).toEqual(['alias.appId']);
  });
});

describe('unknown fields', () => {
  it('warns and drops fields the kernel does not read', () => {
    const report = validateManifest({ ...VALID, author: 'someone', price: 0 });
    expect(fields(warningsOf(report.issues))).toEqual(['author', 'price']);
    expect(report.manifest).not.toBeNull();
    expect(report.manifest && 'author' in report.manifest).toBe(false);
  });

  it('warns about unknown window options and keeps the known ones', () => {
    const report = validateManifest({
      ...VALID,
      window: { width: 300, height: 200, opacity: 0.5 },
    });
    expect(fields(warningsOf(report.issues))).toContain('window.opacity');
    expect(report.manifest?.window).toEqual({ width: 300, height: 200 });
  });
});

describe('warnings that still install', () => {
  it('warns when more than one entry point is declared', () => {
    const report = validateManifest({ ...VALID, script: 'ls' });
    expect(messageFor(warningsOf(report.issues), '')).toBe(
      'Only one of html, script runs. The OS tries alias, then script, then html.',
    );
    expect(report.manifest).not.toBeNull();
  });

  it('warns about an icon that is not a data URL, and keeps it', () => {
    const report = validateManifest({ ...VALID, icon: 'star' });
    expect(messageFor(warningsOf(report.issues), 'icon')).toContain('data: URL');
    expect(report.manifest?.icon).toBe('star');
  });

  it('warns about a version that does not read as numbers', () => {
    expect(fields(warningsOf(validateManifest({ ...VALID, version: 'spring' }).issues))).toEqual([
      'version',
    ]);
  });

  it('warns about an id with no dot in it', () => {
    expect(fields(warningsOf(validateManifest({ ...VALID, id: 'example' }).issues))).toEqual([
      'id',
    ]);
  });

  it('warns when the HTML reaches for the network', () => {
    const report = validateManifest({
      ...VALID,
      html: '<script src="https://cdn.example.com/x.js"></script>',
    });
    expect(messageFor(warningsOf(report.issues), 'html')).toBe(
      'Loads https://cdn.example.com/x.js from the network when it runs.',
    );
  });

  it('warns when an alias points at an app this system does not have', () => {
    const manifest = { id: 'user.a', name: 'A', alias: { appId: 'lumen.nothing' } };
    const known = validateManifest(manifest, { knownAppIds: ['lumen.editor'] });
    expect(messageFor(warningsOf(known.issues), 'alias.appId')).toContain('lumen.nothing');
    const fine = validateManifest(manifest, { knownAppIds: ['lumen.nothing'] });
    expect(warningsOf(fine.issues)).toHaveLength(0);
  });

  it('warns when the opening size is under the minimum', () => {
    const report = validateManifest({
      ...VALID,
      window: { width: 100, height: 100, minWidth: 300, minHeight: 300 },
    });
    expect(fields(warningsOf(report.issues))).toEqual(['window.width', 'window.height']);
  });
});

describe('a valid manifest', () => {
  it('round trips through JSON with nothing added or lost', () => {
    const report = parseManifestText(JSON.stringify(VALID));
    expect(report.issues).toEqual([]);
    expect(report.manifest).toEqual(VALID);
    const again = parseManifestText(formatManifest(report.manifest!));
    expect(again.manifest).toEqual(VALID);
  });

  it('is accepted by the kernel parser it stands in front of', () => {
    const report = validateManifest(VALID);
    expect(() => parseManifest(formatManifest(report.manifest!))).not.toThrow();
  });

  it('keeps alias arguments as they were written', () => {
    const report = validateManifest({
      id: 'user.budget',
      name: 'Budget',
      alias: { appId: 'lumen.sheets', args: { path: '/Users/ada/Documents/Budget.lsd' } },
    });
    expect(report.manifest?.alias).toEqual({
      appId: 'lumen.sheets',
      args: { path: '/Users/ada/Documents/Budget.lsd' },
    });
  });
});

describe('describeCapabilities', () => {
  it('says what an HTML program may do, and where it saves', () => {
    const labels = describeCapabilities({ id: 'user.x', name: 'X', html: '<b>x</b>' }).map(
      (c) => c.label,
    );
    expect(labels[0]).toBe('Runs HTML in a sandboxed frame: no access to your files.');
    expect(labels[1]).toContain('.appdata/user.x.json');
    expect(labels[2]).toContain('Start menu');
  });

  it('names the app an alias launches and the file it opens', () => {
    const labels = describeCapabilities({
      id: 'user.b',
      name: 'B',
      alias: { appId: 'lumen.editor', args: { path: '/Users/ada/notes.txt' } },
    }).map((c) => c.label);
    expect(labels[0]).toBe('Launches the built-in app lumen.editor.');
    expect(labels[1]).toBe('Opens /Users/ada/notes.txt when it starts.');
  });

  it('says a script runs in the Terminal with files in reach', () => {
    const labels = describeCapabilities({ id: 'user.c', name: 'C', script: 'du ~' }).map(
      (c) => c.label,
    );
    expect(labels[0]).toContain('Terminal');
  });

  it('claims nothing for a manifest with no entry point', () => {
    expect(describeCapabilities({ id: 'user.d', name: 'D' })).toEqual([]);
  });
});
