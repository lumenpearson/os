import type { AppManifest } from '@lumen/kernel';
import { describe, expect, it } from 'vitest';
import { bundlePackage, POMODORO, payloadPackage, summary } from './fixture';
import {
  type InstallContext,
  type InstallPlanResult,
  planPackageInstall,
  resolveBundleMembers,
} from './install';
import type { PayloadDocument } from './types';

const UNITS = 'com.lumen.units';
const STARTER = 'com.lumen.starter';
const OFFICE = 'com.lumen.office';

const manifest: AppManifest = {
  id: POMODORO,
  name: 'Pomodoro',
  version: '1.2.0',
  html: '<p>25:00</p>',
};

const appPayload: PayloadDocument = { kind: 'app', manifest };

const fontPayload: PayloadDocument = {
  kind: 'font',
  font: {
    family: 'Lumen Text',
    faces: [
      { weight: 400, style: 'normal', src: 'data:font/woff2;base64,d09GMg==' },
      { weight: 700, style: 'normal', src: 'data:font/woff2;base64,d09GMg==' },
    ],
  },
};

const iconsPayload: PayloadDocument = {
  kind: 'icons',
  icons: { prefix: 'weather', icons: { rain: 'M4 4 L20 20' } },
};

const context: InstallContext = {
  catalogue: [
    summary(),
    summary({ id: UNITS, name: 'Units' }),
    summary({ id: STARTER, name: 'Starter set', kind: 'bundle', size: 0 }),
  ],
  builtInIds: ['lumen.files', 'lumen.editor'],
};

function plan(result: InstallPlanResult) {
  if (!result.ok) throw new Error(`expected a plan: ${result.message}`);
  return result.plan;
}

function refusal(result: InstallPlanResult) {
  if (result.ok) throw new Error('expected the install to be refused');
  return result;
}

describe('planPackageInstall', () => {
  it('hands back the manifest the OS installs', () => {
    const result = plan(planPackageInstall(payloadPackage(), appPayload, context));
    expect(result.id).toBe(POMODORO);
    expect(result.prerequisites).toEqual([]);
    expect(result.resource).toEqual(appPayload);
    expect(result.capabilities).toEqual(['storage']);
    expect(result.summary).toContain('Pomodoro 1.2.0');
  });

  it('hands back the font resource, and says how many weights', () => {
    const pkg = payloadPackage({ kind: 'font', name: 'Lumen Text' });
    const result = plan(planPackageInstall(pkg, fontPayload, context));
    expect(result.resource).toEqual(fontPayload);
    expect(result.summary).toContain('Lumen Text');
    expect(result.summary).toContain('2 weights');
  });

  it('hands back the icon resource, and counts the icons', () => {
    const pkg = payloadPackage({ kind: 'icons', name: 'Weather icons' });
    const result = plan(planPackageInstall(pkg, iconsPayload, context));
    expect(result.resource).toEqual(iconsPayload);
    expect(result.summary).toBe('Adds 1 icon under the prefix weather.');
  });

  it('refuses an id a built-in app already owns', () => {
    const pkg = payloadPackage({ id: 'lumen.editor' });
    const result = refusal(planPackageInstall(pkg, appPayload, context));
    expect(result.refusal).toBe('built-in-id');
    expect(result.message).toContain('lumen.editor');
  });

  it('refuses a payload that installs a different program from the one on the tile', () => {
    const other: PayloadDocument = {
      kind: 'app',
      manifest: { ...manifest, id: 'com.other.thing' },
    };
    const result = refusal(planPackageInstall(payloadPackage(), other, context));
    expect(result.refusal).toBe('id-mismatch');
    expect(result.message).toContain('com.other.thing');
  });

  it('refuses a manifest that shadows a built-in even when the package does not', () => {
    const other: PayloadDocument = { kind: 'app', manifest: { ...manifest, id: 'lumen.files' } };
    expect(refusal(planPackageInstall(payloadPackage(), other, context)).refusal).toBe(
      'built-in-id',
    );
  });

  it('refuses a payload for another version', () => {
    const other: PayloadDocument = { kind: 'app', manifest: { ...manifest, version: '2.0.0' } };
    const result = refusal(planPackageInstall(payloadPackage(), other, context));
    expect(result.refusal).toBe('version-mismatch');
  });

  it('accepts a manifest that states no version of its own', () => {
    const other: PayloadDocument = { kind: 'app', manifest: { ...manifest, version: undefined } };
    expect(plan(planPackageInstall(payloadPackage(), other, context)).version).toBe('1.2.0');
  });

  it('refuses a payload of the wrong kind', () => {
    const result = refusal(planPackageInstall(payloadPackage(), fontPayload, context));
    expect(result.refusal).toBe('kind-mismatch');
    expect(result.message).toContain('font');
  });

  it('refuses to plan an install of something not downloaded', () => {
    expect(refusal(planPackageInstall(payloadPackage(), null, context)).refusal).toBe(
      'missing-payload',
    );
  });

  it('refuses a bundle that arrived with bytes', () => {
    const result = refusal(planPackageInstall(bundlePackage(), appPayload, context));
    expect(result.refusal).toBe('unexpected-payload');
  });

  it('plans a bundle as the members to install first', () => {
    const result = plan(planPackageInstall(bundlePackage(), null, context));
    expect(result.resource).toBeNull();
    expect(result.prerequisites).toEqual([POMODORO, UNITS]);
    expect(result.summary).toBe(`Installs 2 packages: ${POMODORO} and ${UNITS}.`);
  });
});

describe('resolveBundleMembers', () => {
  it('keeps the order the bundle lists', () => {
    const bundle = bundlePackage({ members: [UNITS, POMODORO] });
    expect(resolveBundleMembers(bundle, context)).toEqual({ ok: true, ids: [UNITS, POMODORO] });
  });

  it('refuses a bundle naming a package the catalogue does not have', () => {
    const bundle = bundlePackage({ members: [POMODORO, 'com.lumen.ghost'] });
    const result = resolveBundleMembers(bundle, context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe('unknown-member');
    expect(result.message).toContain('com.lumen.ghost');
  });

  it('refuses a bundle naming a built-in app', () => {
    const bundle = bundlePackage({ members: [POMODORO, 'lumen.files'] });
    const result = resolveBundleMembers(bundle, context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe('built-in-id');
  });

  it('expands a bundle inside a bundle, deepest first, without repeating', () => {
    const inner = bundlePackage({ id: STARTER, members: [POMODORO, UNITS] });
    const outer = bundlePackage({ id: OFFICE, name: 'Office set', members: [STARTER, POMODORO] });
    const nested: InstallContext = {
      ...context,
      catalogue: [...context.catalogue, summary({ id: OFFICE, kind: 'bundle', size: 0 })],
      documents: [inner],
    };
    expect(resolveBundleMembers(outer, nested)).toEqual({ ok: true, ids: [POMODORO, UNITS] });
  });

  it('refuses a bundle inside a bundle that has not been read yet', () => {
    const outer = bundlePackage({ id: OFFICE, name: 'Office set', members: [STARTER] });
    const result = resolveBundleMembers(outer, context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe('unresolved-bundle');
    expect(result.message).toContain(STARTER);
  });

  it('refuses a bundle that contains itself through another', () => {
    const inner = bundlePackage({ id: STARTER, members: [OFFICE] });
    const outer = bundlePackage({ id: OFFICE, name: 'Office set', members: [STARTER] });
    const cyclic: InstallContext = {
      ...context,
      catalogue: [...context.catalogue, summary({ id: OFFICE, kind: 'bundle', size: 0 })],
      documents: [inner, outer],
    };
    const result = resolveBundleMembers(outer, cyclic);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe('cyclic-bundle');
    expect(result.message).toContain(OFFICE);
  });

  it('refuses a bundle with nothing in it', () => {
    const bundle = bundlePackage({ members: [] });
    const result = resolveBundleMembers(bundle, context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.refusal).toBe('empty-bundle');
  });
});
