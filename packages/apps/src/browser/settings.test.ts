import { describe, expect, it } from 'vitest';
import {
  type BrowserSettings,
  blockedReason,
  CUSTOM_ENGINE_ID,
  clampFrameTimeout,
  DEFAULT_DOWNLOADS_DIR,
  DEFAULT_FRAME_TIMEOUT_MS,
  DEFAULT_SETTINGS,
  displayPath,
  downloadsPath,
  engineFor,
  isValidTemplate,
  KNOWN_REFUSALS,
  MAX_EXTERNAL_HOSTS,
  MAX_FRAME_TIMEOUT_MS,
  MIN_FRAME_TIMEOUT_MS,
  nearestZoom,
  newTabUrl,
  normalizeSettings,
  preflight,
  sandboxFor,
  templateFor,
  withHost,
  withoutHost,
} from './settings';
import { DEFAULT_ZOOM } from './tabs';
import { BLANK_URL, DEFAULT_ENGINE_ID, START_URL } from './url';

function settings(patch: Partial<BrowserSettings> = {}): BrowserSettings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

describe('DEFAULT_SETTINGS', () => {
  it('starts on the new-tab page with the default engine', () => {
    expect(DEFAULT_SETTINGS.homepage).toBe(START_URL);
    expect(DEFAULT_SETTINGS.newTab).toBe('start');
    expect(DEFAULT_SETTINGS.searchEngine).toBe(DEFAULT_ENGINE_ID);
    expect(DEFAULT_SETTINGS.searchTemplate).toBe('');
  });

  it('lets a page run scripts and fill in forms, and nothing else', () => {
    expect(DEFAULT_SETTINGS.allowScripts).toBe(true);
    expect(DEFAULT_SETTINGS.allowForms).toBe(true);
    expect(DEFAULT_SETTINGS.allowPopups).toBe(false);
    expect(DEFAULT_SETTINGS.allowDownloads).toBe(false);
    expect(DEFAULT_SETTINGS.allowStorage).toBe(false);
  });

  it('keeps history, shows the bookmarks bar and opens at actual size', () => {
    expect(DEFAULT_SETTINGS.keepHistory).toBe(true);
    expect(DEFAULT_SETTINGS.showBookmarksBar).toBe(true);
    expect(DEFAULT_SETTINGS.defaultZoom).toBe(DEFAULT_ZOOM);
  });

  it('waits a couple of seconds for a frame, not the best part of ten', () => {
    expect(DEFAULT_SETTINGS.frameTimeoutMs).toBe(DEFAULT_FRAME_TIMEOUT_MS);
    expect(DEFAULT_FRAME_TIMEOUT_MS).toBeLessThanOrEqual(3000);
  });

  it('sends downloads to the home folder and opens nothing outside', () => {
    expect(DEFAULT_SETTINGS.downloadsDir).toBe(DEFAULT_DOWNLOADS_DIR);
    expect(DEFAULT_SETTINGS.externalHosts).toEqual([]);
  });
});

describe('normalizeSettings', () => {
  it('falls back to the defaults for anything that is not an object', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings('{}')).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps a well-formed record as it is', () => {
    const stored = settings({
      homepage: 'https://example.com/',
      newTab: 'homepage',
      searchEngine: 'bing',
      allowScripts: false,
      defaultZoom: 1.25,
      frameTimeoutMs: 5000,
      externalHosts: ['example.com'],
    });
    expect(normalizeSettings(stored)).toEqual(stored);
  });

  it('refuses an engine and a new-tab target it does not know', () => {
    expect(normalizeSettings({ searchEngine: 'askjeeves' }).searchEngine).toBe(DEFAULT_ENGINE_ID);
    expect(normalizeSettings({ searchEngine: CUSTOM_ENGINE_ID }).searchEngine).toBe(
      CUSTOM_ENGINE_ID,
    );
    expect(normalizeSettings({ newTab: 'sideways' }).newTab).toBe('start');
  });

  it('snaps a hand-edited zoom to a real step', () => {
    expect(normalizeSettings({ defaultZoom: 1.23 }).defaultZoom).toBe(1.25);
    expect(normalizeSettings({ defaultZoom: 99 }).defaultZoom).toBe(2);
    expect(normalizeSettings({ defaultZoom: 'big' }).defaultZoom).toBe(DEFAULT_ZOOM);
  });

  it('clamps the frame wait into a range a person can live with', () => {
    expect(clampFrameTimeout(50)).toBe(MIN_FRAME_TIMEOUT_MS);
    expect(clampFrameTimeout(60_000)).toBe(MAX_FRAME_TIMEOUT_MS);
    expect(clampFrameTimeout(1234.6)).toBe(1235);
    expect(clampFrameTimeout('soon')).toBe(DEFAULT_FRAME_TIMEOUT_MS);
  });

  it('reads the open-outside list as hosts, without duplicates or junk', () => {
    expect(
      normalizeSettings({
        externalHosts: ['https://WWW.Example.com/path', 'example.com', 7, 'not a host', 'ex.test'],
      }).externalHosts,
    ).toEqual(['example.com', 'ex.test']);
  });

  it('keeps the list to a size the settings page can show', () => {
    const many = Array.from({ length: MAX_EXTERNAL_HOSTS + 20 }, (_, i) => `s${i}.example`);
    expect(normalizeSettings({ externalHosts: many }).externalHosts).toHaveLength(
      MAX_EXTERNAL_HOSTS,
    );
  });

  it('ignores a boolean that is not a boolean', () => {
    expect(normalizeSettings({ allowScripts: 'yes' }).allowScripts).toBe(true);
    expect(normalizeSettings({ allowScripts: false }).allowScripts).toBe(false);
  });
});

describe('nearestZoom', () => {
  it('lands on the closest level', () => {
    expect(nearestZoom(0.51)).toBe(0.5);
    expect(nearestZoom(1.4)).toBe(1.5);
    expect(nearestZoom(Number.NaN)).toBe(DEFAULT_ZOOM);
  });
});

describe('the search template', () => {
  it('accepts a web address with a place for the query', () => {
    expect(isValidTemplate('https://example.com/search?q=%s')).toBe(true);
    expect(isValidTemplate('  http://localhost:8080/?q=%s  ')).toBe(true);
  });

  it('rejects one with no query token, no scheme or the wrong scheme', () => {
    expect(isValidTemplate('https://example.com/search?q=cats')).toBe(false);
    expect(isValidTemplate('example.com/?q=%s')).toBe(false);
    expect(isValidTemplate('ftp://example.com/?q=%s')).toBe(false);
    expect(isValidTemplate('')).toBe(false);
  });

  it('shows the built-in engine template and the custom one', () => {
    expect(templateFor(settings({ searchEngine: 'google' }))).toBe(
      'https://www.google.com/search?q=%s',
    );
    expect(
      templateFor(
        settings({ searchEngine: CUSTOM_ENGINE_ID, searchTemplate: 'https://s.test/?q=%s' }),
      ),
    ).toBe('https://s.test/?q=%s');
  });

  it('names a custom engine after its host', () => {
    const engine = engineFor(
      settings({ searchEngine: CUSTOM_ENGINE_ID, searchTemplate: 'https://www.s.test/?q=%s' }),
    );
    expect(engine.id).toBe(CUSTOM_ENGINE_ID);
    expect(engine.name).toBe('s.test');
    expect(engine.template).toBe('https://www.s.test/?q=%s');
  });

  it('falls back to the default engine when the custom template is unusable', () => {
    const engine = engineFor(settings({ searchEngine: CUSTOM_ENGINE_ID, searchTemplate: 'nope' }));
    expect(engine.id).toBe(DEFAULT_ENGINE_ID);
  });

  it('uses the engine named by its id', () => {
    expect(engineFor(settings({ searchEngine: 'bing' })).name).toBe('Bing');
  });
});

describe('newTabUrl', () => {
  it('follows the setting', () => {
    expect(newTabUrl(settings())).toBe(START_URL);
    expect(newTabUrl(settings({ newTab: 'blank' }))).toBe(BLANK_URL);
    expect(newTabUrl(settings({ newTab: 'homepage', homepage: 'https://example.com/' }))).toBe(
      'https://example.com/',
    );
  });

  it('opens the new-tab page when the homepage is blank', () => {
    expect(newTabUrl(settings({ newTab: 'homepage', homepage: '   ' }))).toBe(START_URL);
  });
});

describe('sandboxFor', () => {
  it('gives a page scripts and forms by default', () => {
    expect(sandboxFor(DEFAULT_SETTINGS)).toBe('allow-scripts allow-forms');
  });

  it('drops the token for anything switched off', () => {
    expect(sandboxFor(settings({ allowScripts: false }))).toBe('allow-forms');
    expect(sandboxFor(settings({ allowScripts: false, allowForms: false }))).toBe('');
  });

  it('adds the tokens for popups, downloads and the frame’s own origin', () => {
    expect(
      sandboxFor(
        settings({
          allowForms: false,
          allowPopups: true,
          allowDownloads: true,
          allowStorage: true,
        }),
      ),
    ).toBe(
      'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-downloads allow-same-origin',
    );
  });

  it('never mentions images, because the attribute has no such token', () => {
    const every = settings({
      allowPopups: true,
      allowDownloads: true,
      allowStorage: true,
    });
    expect(sandboxFor(every)).not.toContain('image');
  });
});

describe('the open-outside list', () => {
  it('stores what the user typed as a host', () => {
    expect(withHost([], 'https://WWW.Example.com/a/b')).toEqual(['example.com']);
  });

  it('leaves the list alone for an address it already covers', () => {
    expect(withHost(['example.com'], 'docs.example.com')).toEqual(['example.com']);
    expect(withHost(['example.com'], 'not a host')).toEqual(['example.com']);
  });

  it('drops every entry that would send an address outside', () => {
    expect(withoutHost(['example.com', 'other.test'], 'https://docs.example.com/x')).toEqual([
      'other.test',
    ]);
    expect(withoutHost(['example.com'], 'example.com')).toEqual([]);
  });

  it('never mutates the list it is given', () => {
    const hosts = ['example.com'];
    withHost(hosts, 'other.test');
    withoutHost(hosts, 'example.com');
    expect(hosts).toEqual(['example.com']);
  });
});

describe('why a page did not appear', () => {
  it('names the header when the host is one we have checked', () => {
    const reason = blockedReason('https://www.google.com/', 'https:');
    expect(reason.cause).toBe('known-refusal');
    expect(reason.text).toBe(
      'google.com sends X-Frame-Options: SAMEORIGIN, so only google.com may embed its pages.',
    );
  });

  it('says nobody may embed a site that sends DENY', () => {
    expect(blockedReason('https://www.iana.org/domains', 'https:').text).toBe(
      'iana.org sends X-Frame-Options: DENY, so no other site may embed its pages.',
    );
  });

  it('names the frame-ancestors rule where that is the header', () => {
    expect(blockedReason('https://www.w3.org/TR/', 'https:').text).toContain(
      "Content-Security-Policy: frame-ancestors 'self'",
    );
  });

  it('blames the page’s own scheme for an http address inside an https Lumen', () => {
    const reason = blockedReason('http://example.com/', 'https:');
    expect(reason.cause).toBe('mixed-content');
    expect(reason.text).toContain('no header from the site is involved');
  });

  it('allows an http address when Lumen itself is served over http', () => {
    expect(preflight('http://example.com/', 'http:')).toBeNull();
  });

  it('says which scheme it was handed when a frame cannot take it', () => {
    const reason = blockedReason('ftp://files.example/', 'https:');
    expect(reason.cause).toBe('unsupported-scheme');
    expect(reason.text).toContain('ftp:');
  });

  it('admits it cannot tell which header stopped an unknown site', () => {
    const reason = blockedReason('https://unchecked.example/', 'https:');
    expect(reason.cause).toBe('unknown');
    expect(reason.text).toContain('X-Frame-Options');
    expect(reason.text).toContain('frame-ancestors');
    expect(reason.text).toContain('cannot tell');
  });

  it('has nothing to say in advance about a site that might work', () => {
    expect(preflight('https://example.com/', 'https:')).toBeNull();
  });

  it('covers subdomains of a host it knows', () => {
    expect(preflight('https://docs.google.com/', 'https:')?.cause).toBe('known-refusal');
  });

  it('gives every panel a heading and one sentence', () => {
    for (const url of [
      'https://www.google.com/',
      'http://example.com/',
      'ftp://files.example/',
      'https://unchecked.example/',
    ]) {
      const reason = blockedReason(url, 'https:');
      expect(reason.title.length).toBeGreaterThan(0);
      expect(reason.text.endsWith('.')).toBe(true);
    }
  });

  it('lists only hosts with the header written next to them', () => {
    for (const refusal of KNOWN_REFUSALS) {
      expect(refusal.header).toMatch(/^(X-Frame-Options|Content-Security-Policy): /);
    }
  });
});

describe('the downloads folder', () => {
  const home = '/Users/ada';

  it('reads a ~ as the home folder', () => {
    expect(downloadsPath(settings(), home)).toBe('/Users/ada/Downloads');
    expect(downloadsPath(settings({ downloadsDir: '~' }), home)).toBe(home);
  });

  it('keeps an absolute path and resolves a relative one against home', () => {
    expect(downloadsPath(settings({ downloadsDir: '/tmp/in' }), home)).toBe('/tmp/in');
    expect(downloadsPath(settings({ downloadsDir: 'Desktop' }), home)).toBe('/Users/ada/Desktop');
  });

  it('falls back to the default folder for an empty setting', () => {
    expect(downloadsPath(settings({ downloadsDir: '  ' }), home)).toBe('/Users/ada/Downloads');
  });

  it('shows a path under home with a ~', () => {
    expect(displayPath('/Users/ada/Downloads', home)).toBe('~/Downloads');
    expect(displayPath(home, home)).toBe('~');
    expect(displayPath('/tmp/x', home)).toBe('/tmp/x');
  });
});
