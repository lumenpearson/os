import { describe, expect, it } from 'vitest';
import {
  cachePath,
  describeResource,
  emptyRecord,
  type InstalledResource,
  readRecord,
  recordPath,
  resourceDocument,
  resourceIds,
  resourcePath,
  withoutResource,
  withResource,
} from './resources';

const HOME = '/Users/Ada Lovelace';

function resource(patch: Partial<InstalledResource> = {}): InstalledResource {
  return {
    id: 'com.lumen.font.seven',
    kind: 'font',
    name: 'Seven Segment',
    version: '1.0.0',
    path: `${HOME}/.store/fonts/com.lumen.font.seven.json`,
    installedAt: 1_760_000_000_000,
    ...patch,
  };
}

describe('paths', () => {
  it('keeps everything the Software Center writes under one folder', () => {
    expect(cachePath(HOME)).toBe(`${HOME}/.store/catalogue.json`);
    expect(recordPath(HOME)).toBe(`${HOME}/.store/resources.json`);
    expect(resourcePath(HOME, 'font', 'a.b')).toBe(`${HOME}/.store/fonts/a.b.json`);
    expect(resourcePath(HOME, 'icons', 'a.b')).toBe(`${HOME}/.store/icons/a.b.json`);
  });
});

describe('readRecord', () => {
  it('reads a record it wrote itself', () => {
    const record = withResource(emptyRecord(), resource());
    expect(readRecord(JSON.parse(JSON.stringify(record)))).toEqual(record);
  });

  it('returns an empty record for anything that is not one', () => {
    expect(readRecord(null).resources).toEqual([]);
    expect(readRecord('nonsense').resources).toEqual([]);
    expect(readRecord([]).resources).toEqual([]);
    expect(readRecord({ version: 9, resources: [resource()] }).resources).toEqual([]);
  });

  it('drops a broken entry rather than the whole file', () => {
    const record = readRecord({
      version: 1,
      resources: [resource(), { id: '' }, { id: 'x', kind: 'wallpaper', path: '/x' }, 4],
    });
    expect(resourceIds(record)).toEqual(['com.lumen.font.seven']);
  });

  it('keeps one entry per id', () => {
    const record = readRecord({ version: 1, resources: [resource(), resource({ name: 'Other' })] });
    expect(record.resources).toHaveLength(1);
    expect(record.resources[0]?.name).toBe('Seven Segment');
  });
});

describe('withResource', () => {
  it('replaces an entry under the same id and keeps the list sorted', () => {
    const first = withResource(emptyRecord(), resource());
    const second = withResource(first, resource({ id: 'com.lumen.icons.weather', kind: 'icons' }));
    const third = withResource(second, resource({ version: '2.0.0' }));
    expect(resourceIds(third)).toEqual(['com.lumen.font.seven', 'com.lumen.icons.weather']);
    expect(third.resources[0]?.version).toBe('2.0.0');
  });

  it('removes one by id', () => {
    const record = withResource(emptyRecord(), resource());
    expect(withoutResource(record, 'com.lumen.font.seven').resources).toEqual([]);
    expect(withoutResource(record, 'nobody').resources).toHaveLength(1);
  });
});

describe('resourceDocument', () => {
  it('writes a typeface with the package it came from named beside it', () => {
    const document = resourceDocument('com.lumen.font.seven', '1.0.0', {
      kind: 'font',
      font: { family: 'Seven', faces: [{ weight: 400, style: 'normal', src: 'data:font/ttf,' }] },
    });
    expect(document).toMatchObject({
      id: 'com.lumen.font.seven',
      version: '1.0.0',
      family: 'Seven',
    });
  });

  it('writes an icon set with its prefix and its paths', () => {
    const document = resourceDocument('com.lumen.icons.weather', '1.1.0', {
      kind: 'icons',
      icons: { prefix: 'weather', icons: { sun: 'M1 1' } },
    });
    expect(document).toMatchObject({ prefix: 'weather', icons: { sun: 'M1 1' } });
  });
});

describe('describeResource', () => {
  it('names the file it wrote', () => {
    expect(describeResource(resource(), '1 weight')).toBe(
      `Typeface written to ${HOME}/.store/fonts/com.lumen.font.seven.json (1 weight).`,
    );
  });
});
