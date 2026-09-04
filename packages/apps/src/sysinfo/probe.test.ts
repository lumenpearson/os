import { describe, expect, it } from 'vitest';
import {
  bytesFact,
  type Fact,
  formatUtcOffset,
  type GlLike,
  gpuFromContext,
  known,
  maybe,
  probeArchitecture,
  probeBrowser,
  probeColorDepth,
  probeColorScheme,
  probeCores,
  probeDeviceMemory,
  probeDevicePixels,
  probeEngine,
  probeHeap,
  probeHostSystem,
  probeLanguages,
  probeLocale,
  probePixelRatio,
  probePointer,
  probeReducedMotion,
  probeScreenSize,
  probeTimeZone,
  probeUserAgent,
  REASONS,
  readFeatures,
  supportFact,
  unknown,
} from './probe';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const FIREFOX_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';
const SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';

/** Every unavailable fact must carry a reason and no value. */
function expectUnavailable(fact: Fact): string {
  expect(fact.available).toBe(false);
  expect(fact.value).toBe('');
  expect(fact.reason).toBeTruthy();
  return fact.reason ?? '';
}

function media(matching: readonly string[]) {
  return (query: string) => ({ matches: matching.includes(query) });
}

describe('fact constructors', () => {
  it('trims a known value', () => {
    expect(known('  8  ')).toEqual({ value: '8', available: true });
  });

  it('records the reason on an unknown value', () => {
    expect(unknown('nope')).toEqual({ value: '', available: false, reason: 'nope' });
  });

  it('treats null, undefined and blank as unavailable', () => {
    for (const value of [null, undefined, '', '   ']) {
      expectUnavailable(maybe(value, 'missing'));
    }
  });

  it('accepts numbers, including zero', () => {
    expect(maybe(0, 'missing')).toEqual({ value: '0', available: true });
  });

  it('formats byte counts and rejects impossible ones', () => {
    expect(bytesFact(2048, 'missing').value).toBe('2.0 KB');
    expect(bytesFact(0, 'missing')).toEqual({ value: '0 B', available: true });
    expectUnavailable(bytesFact(-1, 'missing'));
    expectUnavailable(bytesFact(Number.NaN, 'missing'));
    expectUnavailable(bytesFact(null, 'missing'));
  });
});

describe('processor probes', () => {
  it('reads hardwareConcurrency', () => {
    expect(probeCores({ hardwareConcurrency: 16 }).value).toBe('16');
  });

  it('says so when the browser withholds the core count', () => {
    expect(expectUnavailable(probeCores({}))).toBe(REASONS.cores);
    expect(expectUnavailable(probeCores({ hardwareConcurrency: 0 }))).toBe(REASONS.cores);
    expect(expectUnavailable(probeCores(undefined))).toBe(REASONS.noNavigator);
  });

  it('prefers the host architecture over client hints', () => {
    expect(probeArchitecture('aarch64', { architecture: 'x86', bitness: '64' }).value).toBe(
      'aarch64',
    );
  });

  it('joins architecture and bitness from client hints', () => {
    expect(probeArchitecture(null, { architecture: 'x86', bitness: '64' }).value).toBe('x86-64');
    expect(probeArchitecture(null, { architecture: 'arm' }).value).toBe('arm');
  });

  it('never guesses the architecture from the user agent', () => {
    expect(expectUnavailable(probeArchitecture(null, null))).toBe(REASONS.architecture);
    expect(expectUnavailable(probeArchitecture('unknown', null))).toBe(REASONS.architecture);
    expect(expectUnavailable(probeArchitecture('', { architecture: '  ' }))).toBe(
      REASONS.architecture,
    );
  });
});

describe('memory probes', () => {
  it('reports deviceMemory in gigabytes', () => {
    expect(probeDeviceMemory({ deviceMemory: 8 }).value).toBe('8 GB');
  });

  it('says deviceMemory is Chromium-only when it is absent', () => {
    expect(expectUnavailable(probeDeviceMemory({}))).toBe(REASONS.deviceMemory);
  });

  it('reads the JS heap when performance.memory exists', () => {
    const heap = { usedJSHeapSize: 12 * 1024 * 1024, jsHeapSizeLimit: 2 * 1024 ** 3 };
    expect(probeHeap(heap, 'usedJSHeapSize').value).toBe('12.0 MB');
    expect(probeHeap(heap, 'jsHeapSizeLimit').value).toBe('2.0 GB');
  });

  it('says the heap is unavailable outside Chromium', () => {
    expect(expectUnavailable(probeHeap(undefined, 'usedJSHeapSize'))).toBe(REASONS.heap);
    expect(expectUnavailable(probeHeap({}, 'totalJSHeapSize'))).toBe(REASONS.heap);
  });
});

describe('display probes', () => {
  it('reads the screen, device pixels, ratio and depth', () => {
    const screen = { width: 1512, height: 982, colorDepth: 30 };
    expect(probeScreenSize(screen).value).toBe('1512 × 982');
    expect(probeDevicePixels(screen, 2).value).toBe('3024 × 1964');
    expect(probePixelRatio(2).value).toBe('2×');
    expect(probeColorDepth(screen).value).toBe('30-bit');
  });

  it('reports nothing without a screen or a pixel ratio', () => {
    expect(expectUnavailable(probeScreenSize(undefined))).toBe(REASONS.noScreen);
    expect(expectUnavailable(probeScreenSize({ width: 0, height: 0 }))).toBe(REASONS.noScreen);
    expect(expectUnavailable(probeColorDepth({}))).toBe(REASONS.noScreen);
    expect(expectUnavailable(probeDevicePixels({ width: 100, height: 100 }, undefined))).toMatch(
      /devicePixelRatio/,
    );
    expect(expectUnavailable(probePixelRatio(Number.NaN))).toMatch(/devicePixelRatio/);
  });

  it('reads media preferences', () => {
    expect(probeColorScheme(media(['(prefers-color-scheme: dark)'])).value).toBe('Dark');
    expect(probeColorScheme(media(['(prefers-color-scheme: light)'])).value).toBe('Light');
    expect(probeReducedMotion(media(['(prefers-reduced-motion: reduce)'])).value).toBe('Reduce');
    expect(probePointer(media(['(pointer: coarse)'])).value).toBe('Coarse — touch');
  });

  it('says so when nothing matches or matchMedia is missing', () => {
    expect(expectUnavailable(probeColorScheme(media([])))).toMatch(/colour-scheme preference/);
    expect(expectUnavailable(probePointer(media([])))).toMatch(/primary pointer/);
    expect(expectUnavailable(probeReducedMotion(undefined))).toBe(REASONS.noMatchMedia);
  });

  it('survives a matchMedia that throws', () => {
    const throwing = () => {
      throw new Error('bad query');
    };
    expect(expectUnavailable(probeColorScheme(throwing))).toBe(REASONS.noMatchMedia);
  });
});

describe('gpuFromContext', () => {
  const VERSION = 0x1f02;
  const RENDERER = 0x9246;
  const VENDOR = 0x9245;

  function context(values: Record<number, unknown>, extension: unknown): GlLike {
    return {
      VERSION,
      getParameter: (name) => values[name],
      getExtension: () => extension,
    };
  }

  it('reads the unmasked renderer and vendor', () => {
    const gl = context(
      {
        [VERSION]: 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
        [RENDERER]: 'ANGLE (NVIDIA GeForce RTX 4070)',
        [VENDOR]: 'Google Inc. (NVIDIA)',
      },
      { UNMASKED_RENDERER_WEBGL: RENDERER, UNMASKED_VENDOR_WEBGL: VENDOR },
    );
    const gpu = gpuFromContext(gl);
    expect(gpu.renderer.value).toBe('ANGLE (NVIDIA GeForce RTX 4070)');
    expect(gpu.vendor.value).toBe('Google Inc. (NVIDIA)');
    expect(gpu.api.value).toBe('WebGL 2.0 (OpenGL ES 3.0 Chromium)');
  });

  it('says the debug extension is blocked but still reports the API', () => {
    const gpu = gpuFromContext(context({ [VERSION]: 'WebGL 1.0' }, null));
    expect(expectUnavailable(gpu.renderer)).toBe(REASONS.debugRenderer);
    expect(expectUnavailable(gpu.vendor)).toBe(REASONS.debugRenderer);
    expect(gpu.api.value).toBe('WebGL 1.0');
  });

  it('reports every row as unavailable without a context', () => {
    const gpu = gpuFromContext(null);
    for (const fact of [gpu.renderer, gpu.vendor, gpu.api]) {
      expect(expectUnavailable(fact)).toBe(REASONS.webgl);
    }
  });

  it('survives a context that throws on getExtension or getParameter', () => {
    const gl: GlLike = {
      VERSION,
      getParameter: () => {
        throw new Error('context lost');
      },
      getExtension: () => {
        throw new Error('context lost');
      },
    };
    const gpu = gpuFromContext(gl);
    expect(expectUnavailable(gpu.renderer)).toBe(REASONS.debugRenderer);
    expect(gpu.api.available).toBe(false);
  });
});

describe('software probes', () => {
  it('names the browser from client-hint brands, dropping the GREASE entry', () => {
    const fact = probeBrowser({
      userAgentData: {
        brands: [
          { brand: 'Not)A;Brand', version: '99' },
          { brand: 'Chromium', version: '140' },
          { brand: 'Google Chrome', version: '140' },
        ],
      },
    });
    expect(fact.value).toBe('Chromium 140, Google Chrome 140');
  });

  it('falls back to the user-agent string', () => {
    expect(probeBrowser({ userAgent: CHROME_UA }).value).toBe('Chrome 140.0.0.0');
    expect(probeBrowser({ userAgent: FIREFOX_UA }).value).toBe('Firefox 131.0');
    expect(probeBrowser({ userAgent: SAFARI_UA }).value).toBe('Safari 17.6');
  });

  it('says so when nothing names a browser', () => {
    expect(expectUnavailable(probeBrowser({ userAgent: 'curl/8.4.0' }))).toBe(REASONS.browser);
    expect(expectUnavailable(probeBrowser({ userAgentData: { brands: [] } }))).toBe(
      REASONS.browser,
    );
  });

  it('reports only the engine the user agent states', () => {
    expect(probeEngine(FIREFOX_UA).value).toBe('Gecko 131.0');
    expect(probeEngine(CHROME_UA).value).toBe('AppleWebKit 537.36');
    expect(probeEngine(SAFARI_UA).value).toBe('AppleWebKit 605.1.15');
    expect(expectUnavailable(probeEngine('curl/8.4.0'))).toBe(REASONS.engine);
    expect(expectUnavailable(probeEngine(undefined))).toBe(REASONS.engine);
  });

  it('lists the language preferences', () => {
    expect(probeLanguages({ languages: ['en-GB', 'en'] }).value).toBe('en-GB, en');
    expect(probeLanguages({ language: 'fr-FR' }).value).toBe('fr-FR');
    expect(expectUnavailable(probeLanguages({}))).toMatch(/language preference/);
  });

  it('reads the locale and time zone from Intl', () => {
    const resolved = {
      locale: 'en-GB',
      timeZone: 'Europe/Berlin',
    } as Intl.ResolvedDateTimeFormatOptions;
    expect(probeLocale(resolved).value).toBe('en-GB');
    expect(probeTimeZone(resolved, -120).value).toBe('Europe/Berlin (UTC+02:00)');
    expect(probeTimeZone(resolved, undefined).value).toBe('Europe/Berlin');
    expect(expectUnavailable(probeLocale(undefined))).toBe(REASONS.intl);
    expect(expectUnavailable(probeTimeZone(undefined, 0))).toBe(REASONS.timeZone);
  });

  it('formats UTC offsets on both sides of the meridian', () => {
    expect(formatUtcOffset(0)).toBe('+00:00');
    expect(formatUtcOffset(-330)).toBe('+05:30');
    expect(formatUtcOffset(480)).toBe('-08:00');
    expect(formatUtcOffset(Number.NaN)).toBe('');
  });

  it('returns the user-agent string verbatim', () => {
    expect(probeUserAgent({ userAgent: CHROME_UA }).value).toBe(CHROME_UA);
    expect(expectUnavailable(probeUserAgent(undefined))).toBe(REASONS.noNavigator);
  });
});

describe('probeHostSystem', () => {
  it('prefers the host reading', () => {
    expect(probeHostSystem({ name: 'Windows', version: '11' }, undefined, null).value).toBe(
      'Windows 11',
    );
  });

  it('uses userAgentData and the platform-version hint in a browser', () => {
    const nav = { userAgentData: { platform: 'macOS' }, userAgent: SAFARI_UA };
    expect(probeHostSystem(null, nav, { platformVersion: '15.6.0' }).value).toBe('macOS 15.6.0');
    expect(probeHostSystem(null, nav, null).value).toBe('macOS');
  });

  it('refuses to read the host version out of a frozen user agent', () => {
    expect(expectUnavailable(probeHostSystem(null, { userAgent: SAFARI_UA }, null))).toBe(
      REASONS.hostPlatform,
    );
  });
});

describe('readFeatures', () => {
  it('probes each capability and reports a boolean for it', () => {
    const features = readFeatures();
    expect(features.map((f) => f.id)).toEqual([
      'opfs',
      'indexeddb',
      'webcrypto',
      'webgl',
      'serviceworker',
      'clipboard',
    ]);
    expect(features.every((f) => typeof f.supported === 'boolean')).toBe(true);
    // fake-indexeddb is installed by the test setup; WebGL is not implemented
    // by the test DOM, so the unsupported branch runs here too.
    expect(features.find((f) => f.id === 'indexeddb')?.supported).toBe(true);
    expect(features.find((f) => f.id === 'webgl')?.supported).toBe(false);
  });

  it('renders support as a plain value, never a badge', () => {
    expect(supportFact(true)).toEqual({ value: 'Supported', available: true });
    expect(supportFact(false)).toEqual({ value: 'Not supported', available: true });
  });
});
