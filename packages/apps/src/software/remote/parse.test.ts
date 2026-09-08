import { describe, expect, it } from 'vitest';
import {
  appPayloadJson,
  artworkJson,
  bannerJson,
  bundleJson,
  catalogueJson,
  fontPayloadJson,
  iconsPayloadJson,
  POMODORO,
  packageJson,
  summaryJson,
} from './fixture';
import {
  describeProblems,
  isPackageId,
  isPayloadKind,
  isUnsupportedFormat,
  type ParseProblem,
  type ParseResult,
  parseArtwork,
  parseBanner,
  parseCatalogue,
  parseCatalogueText,
  parseJson,
  parsePackage,
  parsePackageText,
  parsePayload,
  parsePayloadText,
} from './parse';

function unwrap<T>(result: ParseResult<T>): T {
  if (!result.ok) throw new Error(`expected a value: ${describeProblems(result.problems, 10)}`);
  return result.value;
}

function refusal<T>(result: ParseResult<T>): ParseProblem[] {
  if (result.ok) throw new Error('expected the document to be refused');
  return result.problems;
}

function paths(problems: readonly ParseProblem[]): string[] {
  return problems.map((problem) => problem.path);
}

describe('parseCatalogue', () => {
  it('reads a catalogue and normalises what the store left out', () => {
    const catalogue = unwrap(parseCatalogue(catalogueJson()));
    expect(catalogue.name).toBe('Lumen Store');
    expect(catalogue.packages.map((p) => p.id)).toEqual([POMODORO, 'com.lumen.units']);
    expect(catalogue.sections[0]?.packages).toEqual([POMODORO]);
    expect(catalogue.collections[0]?.artwork).toEqual({ shape: 'ramp', seed: 7, tone: 'accent' });
    expect(catalogue.banners[0]?.target).toEqual({ kind: 'collection', id: 'essentials' });
  });

  it('keeps fields it does not know, by ignoring them rather than refusing', () => {
    const catalogue = unwrap(parseCatalogue(catalogueJson({ featured: ['com.lumen.units'] })));
    expect(catalogue.packages).toHaveLength(2);
  });

  it('refuses a format newer than this client reads', () => {
    const problems = refusal(parseCatalogue(catalogueJson({ format: 2 })));
    expect(isUnsupportedFormat(problems)).toBe(true);
    expect(problems[0]?.message).toContain('format 2');
  });

  it('reads its own format', () => {
    expect(unwrap(parseCatalogue(catalogueJson({ format: 1 }))).format).toBe(1);
  });

  it('refuses a format that is not a number', () => {
    const problems = refusal(parseCatalogue(catalogueJson({ format: '1' })));
    expect(isUnsupportedFormat(problems)).toBe(false);
    expect(paths(problems)).toContain('format');
  });

  it('refuses the whole catalogue when one package is wrong', () => {
    const packages = [summaryJson(), summaryJson({ id: 'com.lumen.units', size: 'a lot' })];
    const result = parseCatalogue(catalogueJson({ packages }));
    expect(result.ok).toBe(false);
    expect(paths(refusal(result))).toEqual(['packages[1].size']);
  });

  it('refuses a package listed twice', () => {
    const packages = [summaryJson(), summaryJson()];
    expect(refusal(parseCatalogue(catalogueJson({ packages })))[0]?.code).toBe('duplicate');
  });

  it('refuses an id the format would not allow', () => {
    const packages = [summaryJson({ id: 'Com.Lumen.Shouting' })];
    expect(paths(refusal(parseCatalogue(catalogueJson({ packages }))))).toEqual(['packages[0].id']);
  });

  it('refuses a banner pointing at something that is not a target', () => {
    const banners = [bannerJson({ target: { kind: 'website', id: 'essentials' } })];
    expect(paths(refusal(parseCatalogue(catalogueJson({ banners }))))).toEqual([
      'banners[0].target.kind',
    ]);
  });

  it('refuses a document that is not an object at all', () => {
    expect(refusal(parseCatalogue([])).at(0)?.code).toBe('wrong-type');
    expect(refusal(parseCatalogue(null)).at(0)?.code).toBe('missing');
  });

  it('refuses a timestamp that names no moment', () => {
    expect(
      paths(refusal(parseCatalogue(catalogueJson({ updated: '2026-13-45T00:00:00Z' })))),
    ).toEqual(['updated']);
  });
});

describe('parseCatalogueText', () => {
  it('reads JSON text', () => {
    expect(unwrap(parseCatalogueText(JSON.stringify(catalogueJson()))).packages).toHaveLength(2);
  });

  it('reports broken JSON as one problem, not an exception', () => {
    const problems = refusal(parseCatalogueText('{"format": 1,'));
    expect(problems).toHaveLength(1);
    expect(problems[0]?.code).toBe('json');
  });

  it('reports an empty body', () => {
    expect(refusal(parseCatalogueText('   '))[0]?.message).toBe('The document is empty.');
  });
});

describe('parsePackage', () => {
  it('reads a package with a payload', () => {
    const pkg = unwrap(parsePackage(packageJson()));
    expect(pkg.kind).toBe('app');
    if (pkg.kind === 'bundle') throw new Error('expected a payload package');
    expect(pkg.payload).toBe(`payload/${POMODORO}-1.2.0.json`);
    expect(pkg.requires.os).toBe('>=0.1.0');
    expect(pkg.capabilities).toEqual(['storage']);
  });

  it('fills in what a package left out', () => {
    const pkg = unwrap(
      parsePackage(
        packageJson({
          requires: undefined,
          capabilities: undefined,
          screenshots: undefined,
          releaseNotes: undefined,
        }),
      ),
    );
    expect(pkg.requires).toEqual({ os: null });
    expect(pkg.capabilities).toEqual([]);
    expect(pkg.screenshots).toEqual([]);
    expect(pkg.releaseNotes).toBeNull();
  });

  it('refuses a payload path that leaves the store', () => {
    expect(paths(refusal(parsePackage(packageJson({ payload: '../../etc/passwd' }))))).toEqual([
      'payload',
    ]);
    expect(
      paths(refusal(parsePackage(packageJson({ payload: 'https://elsewhere/x.json' })))),
    ).toEqual(['payload']);
  });

  it('refuses a digest that is not one', () => {
    expect(paths(refusal(parsePackage(packageJson({ sha256: 'ABC' }))))).toEqual(['sha256']);
    expect(paths(refusal(parsePackage(packageJson({ sha256: undefined }))))).toEqual(['sha256']);
  });

  it('refuses a package with no description', () => {
    expect(paths(refusal(parsePackage(packageJson({ description: '  ' }))))).toEqual([
      'description',
    ]);
  });

  it('reads a bundle', () => {
    const pkg = unwrap(parsePackage(bundleJson()));
    if (pkg.kind !== 'bundle') throw new Error('expected a bundle');
    expect(pkg.members).toEqual([POMODORO, 'com.lumen.units']);
  });

  it('refuses a bundle that also claims a payload', () => {
    const problems = refusal(parsePackage(bundleJson({ payload: 'payload/x.json' })));
    expect(problems[0]?.code).toBe('inconsistent');
  });

  it('refuses a bundle with no members', () => {
    expect(paths(refusal(parsePackage(bundleJson({ members: [] }))))).toEqual(['members']);
  });

  it('refuses a bundle that contains itself', () => {
    const problems = refusal(
      parsePackage(bundleJson({ members: ['com.lumen.starter', POMODORO] })),
    );
    expect(problems[0]?.message).toContain('cannot contain itself');
  });

  it('refuses a bundle that says it downloads bytes', () => {
    expect(paths(refusal(parsePackage(bundleJson({ size: 12 }))))).toEqual(['size']);
  });

  it('refuses members on a package that is not a bundle', () => {
    expect(paths(refusal(parsePackage(packageJson({ members: [POMODORO] }))))).toEqual(['members']);
  });

  it('reads JSON text', () => {
    expect(unwrap(parsePackageText(JSON.stringify(packageJson()))).id).toBe(POMODORO);
  });
});

describe('parseBanner', () => {
  it('reads a banner document', () => {
    expect(unwrap(parseBanner(bannerJson())).title).toBe('Five programs to start with');
  });

  it('refuses a banner without artwork', () => {
    expect(paths(refusal(parseBanner(bannerJson({ artwork: undefined }))))).toEqual(['artwork']);
  });
});

describe('parseArtwork', () => {
  it('reads a recipe', () => {
    expect(unwrap(parseArtwork(artworkJson()))).toEqual({
      shape: 'rings',
      seed: 7,
      tone: 'accent',
    });
  });

  it('refuses a shape it cannot draw and a seed it cannot use', () => {
    expect(paths(refusal(parseArtwork(artworkJson({ shape: 'photograph' }))))).toEqual(['shape']);
    expect(paths(refusal(parseArtwork(artworkJson({ seed: 1.5 }))))).toEqual(['seed']);
    expect(paths(refusal(parseArtwork(artworkJson({ seed: -1 }))))).toEqual(['seed']);
  });
});

describe('parsePayload', () => {
  it('reads an app payload as a manifest', () => {
    const payload = unwrap(parsePayload('app', appPayloadJson()));
    if (payload.kind !== 'app') throw new Error('expected an app payload');
    expect(payload.manifest.id).toBe(POMODORO);
    expect(payload.manifest.html).toBe('<p>25:00</p>');
  });

  it('refuses an app payload with nothing to run', () => {
    expect(refusal(parsePayload('app', appPayloadJson({ html: undefined })))).not.toHaveLength(0);
  });

  it('reads a font payload', () => {
    const payload = unwrap(parsePayload('font', fontPayloadJson()));
    if (payload.kind !== 'font') throw new Error('expected a font payload');
    expect(payload.font.family).toBe('Lumen Text');
    expect(payload.font.faces[0]?.weight).toBe(400);
  });

  it('refuses a font that would make a second request', () => {
    const faces = [{ weight: 400, style: 'normal', src: 'https://fonts.example/a.woff2' }];
    expect(paths(refusal(parsePayload('font', fontPayloadJson({ faces }))))).toEqual([
      'faces[0].src',
    ]);
  });

  it('refuses a font with no faces and a weight outside the scale', () => {
    expect(paths(refusal(parsePayload('font', fontPayloadJson({ faces: [] }))))).toEqual(['faces']);
    const faces = [{ weight: 4000, style: 'normal', src: 'data:font/woff2;base64,d09GMg==' }];
    expect(paths(refusal(parsePayload('font', fontPayloadJson({ faces }))))).toEqual([
      'faces[0].weight',
    ]);
  });

  it('reads an icon payload', () => {
    const payload = unwrap(parsePayload('icons', iconsPayloadJson()));
    if (payload.kind !== 'icons') throw new Error('expected an icons payload');
    expect(payload.icons.prefix).toBe('weather');
    expect(Object.keys(payload.icons.icons)).toEqual(['rain', 'sun']);
  });

  it('refuses path data that is not path data', () => {
    const icons = { rain: '<script>alert(1)</script>', sun: 'M12 4' };
    expect(paths(refusal(parsePayload('icons', iconsPayloadJson({ icons }))))).toEqual([
      'icons.rain',
    ]);
  });

  it('refuses an icon name that would reach the prototype', () => {
    const icons = JSON.parse('{"__proto__": "M4 4 L20 20", "rain": "M4 4"}') as Record<
      string,
      string
    >;
    const problems = refusal(parsePayload('icons', iconsPayloadJson({ icons })));
    expect(paths(problems)).toEqual(['icons.__proto__']);
  });

  it('refuses an empty icon set', () => {
    expect(paths(refusal(parsePayload('icons', iconsPayloadJson({ icons: {} }))))).toEqual([
      'icons',
    ]);
  });

  it('reads JSON text for the kind it was told', () => {
    const text = JSON.stringify(fontPayloadJson());
    expect(unwrap(parsePayloadText('font', text)).kind).toBe('font');
    // The same bytes are not an app manifest, and saying so is the point.
    expect(refusal(parsePayloadText('app', text))).not.toHaveLength(0);
  });
});

describe('parseJson', () => {
  it('returns the value it read', () => {
    expect(unwrap(parseJson('{"a":1}'))).toEqual({ a: 1 });
  });
});

describe('describeProblems', () => {
  it('names the fields and counts the rest', () => {
    const problems: ParseProblem[] = [
      { path: 'id', code: 'missing', message: 'Required.' },
      { path: 'name', code: 'missing', message: 'Required.' },
      { path: 'size', code: 'missing', message: 'Required.' },
      { path: 'price', code: 'missing', message: 'Required.' },
    ];
    expect(describeProblems(problems)).toBe(
      'id: Required. name: Required. size: Required. And 1 more.',
    );
    expect(describeProblems([])).toBe('');
  });
});

describe('identifiers and kinds', () => {
  it('knows a package id when it sees one', () => {
    expect(isPackageId(POMODORO)).toBe(true);
    expect(isPackageId('a')).toBe(false);
    expect(isPackageId('com.lumen.Pomodoro')).toBe(false);
    expect(isPackageId('com/lumen')).toBe(false);
  });

  it('knows which kinds carry a payload', () => {
    expect(isPayloadKind('app')).toBe(true);
    expect(isPayloadKind('bundle')).toBe(false);
  });
});
