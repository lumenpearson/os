/**
 * From a verified payload to what the OS installs.
 *
 * Nothing here writes a file, registers an app or touches the kernel: it
 * decides, and hands back a plan for the caller to carry out. That keeps the
 * refusals testable and keeps the decision in one place — in particular rule 3
 * of `store/FORMAT.md`, that nothing in a store may take a built-in app's id,
 * because the OS would keep running its own and quietly ignore the download.
 *
 * A bundle has nothing of its own to install: its plan is the ordered list of
 * members to install first, with a nested bundle expanded where the storefront
 * has already fetched its document.
 */

import type { AppManifest } from '@lumen/kernel';
import type {
  BundlePackage,
  PackageDocument,
  PackageSummary,
  PayloadDocument,
  PayloadPackage,
} from './types';

export type InstallRefusal =
  | 'built-in-id'
  | 'missing-payload'
  | 'unexpected-payload'
  | 'kind-mismatch'
  | 'id-mismatch'
  | 'version-mismatch'
  | 'empty-bundle'
  | 'unknown-member'
  | 'unresolved-bundle'
  | 'cyclic-bundle';

export interface InstallPlan {
  id: string;
  name: string;
  version: string;
  /** Packages to install first, in order. Empty for everything but a bundle. */
  prerequisites: string[];
  /** What the OS registers for this package; null for a bundle. */
  resource: PayloadDocument | null;
  /** What installing it allows, as the package declared it. */
  capabilities: string[];
  /** One sentence saying what carrying out this plan does. */
  summary: string;
}

export type InstallPlanResult =
  | { ok: true; plan: InstallPlan }
  | { ok: false; refusal: InstallRefusal; message: string };

export interface InstallContext {
  /** Every package the catalogue lists, so a bundle can be checked against it. */
  catalogue: readonly PackageSummary[];
  /** Ids the kernel already owns. A store package may not take one. */
  builtInIds?: readonly string[];
  /** Documents already fetched, so a bundle inside a bundle can be expanded. */
  documents?: readonly PackageDocument[];
}

export type BundleResolution =
  | { ok: true; ids: string[] }
  | { ok: false; refusal: InstallRefusal; message: string };

function refuse(
  refusal: InstallRefusal,
  message: string,
): { ok: false; refusal: InstallRefusal; message: string } {
  return { ok: false, refusal, message };
}

function shadowsBuiltIn(id: string, context: InstallContext): boolean {
  return (context.builtInIds ?? []).includes(id);
}

const BUILT_IN_MESSAGE = (id: string): string =>
  `${id} is the identifier of an app built into Lumen OS. The system would keep running its own and ignore this one.`;

/** A list read as prose: "a, b and c". */
function andList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * The members to install before a bundle, in the order the bundle lists them,
 * with a member bundle expanded in place.
 */
export function resolveBundleMembers(
  pkg: BundlePackage,
  context: InstallContext,
): BundleResolution {
  const summaries = new Map(context.catalogue.map((summary) => [summary.id, summary]));
  const documents = new Map((context.documents ?? []).map((doc) => [doc.id, doc]));
  const ids: string[] = [];

  const walk = (bundle: BundlePackage, trail: readonly string[]): BundleResolution | null => {
    if (bundle.members.length === 0) {
      return refuse('empty-bundle', `${bundle.name} lists no packages to install.`);
    }
    for (const id of bundle.members) {
      // The built-in check comes first: it is the more exact sentence, and it
      // holds whether or not the catalogue also lists the id.
      if (shadowsBuiltIn(id, context)) {
        return refuse('built-in-id', BUILT_IN_MESSAGE(id));
      }
      const summary = summaries.get(id);
      if (summary === undefined) {
        return refuse(
          'unknown-member',
          `${bundle.name} needs ${id}, which this store's catalogue does not list.`,
        );
      }
      if (summary.kind !== 'bundle') {
        if (!ids.includes(id)) ids.push(id);
        continue;
      }
      if (trail.includes(id)) {
        return refuse(
          'cyclic-bundle',
          `${id} contains itself, through ${andList([...trail, id])}. Nothing can be installed from it.`,
        );
      }
      const document = documents.get(id);
      if (document === undefined || document.kind !== 'bundle') {
        return refuse(
          'unresolved-bundle',
          `${bundle.name} contains the bundle ${id}, which has not been read yet.`,
        );
      }
      const nested = walk(document, [...trail, id]);
      if (nested !== null) return nested;
    }
    return null;
  };

  const problem = walk(pkg, [pkg.id]);
  if (problem !== null) return problem;
  return { ok: true, ids };
}

function payloadSummary(pkg: PayloadPackage, payload: PayloadDocument): string {
  if (payload.kind === 'app') {
    return `Installs ${pkg.name} ${pkg.version}, which then appears in the Start menu and in search.`;
  }
  if (payload.kind === 'font') {
    const faces = payload.font.faces.length;
    const weights = faces === 1 ? 'one weight' : `${faces} weights`;
    return `Adds the typeface ${payload.font.family} (${weights}) to the fonts every program can use.`;
  }
  const count = Object.keys(payload.icons.icons).length;
  const icons = count === 1 ? '1 icon' : `${count} icons`;
  return `Adds ${icons} under the prefix ${payload.icons.prefix}.`;
}

/**
 * The plan for one package. `payload` is the verified payload document for an
 * app, font or icon set, and null for a bundle.
 */
export function planPackageInstall(
  pkg: PackageDocument,
  payload: PayloadDocument | null,
  context: InstallContext,
): InstallPlanResult {
  if (shadowsBuiltIn(pkg.id, context)) {
    return refuse('built-in-id', BUILT_IN_MESSAGE(pkg.id));
  }

  if (pkg.kind === 'bundle') {
    if (payload !== null) {
      return refuse(
        'unexpected-payload',
        `${pkg.name} is a bundle: it installs its members and downloads nothing of its own.`,
      );
    }
    const members = resolveBundleMembers(pkg, context);
    if (!members.ok) return members;
    const count = members.ids.length;
    return {
      ok: true,
      plan: {
        id: pkg.id,
        name: pkg.name,
        version: pkg.version,
        prerequisites: members.ids,
        resource: null,
        capabilities: pkg.capabilities,
        summary: `Installs ${count === 1 ? '1 package' : `${count} packages`}: ${andList(members.ids)}.`,
      },
    };
  }

  if (payload === null) {
    return refuse('missing-payload', `${pkg.name} has not been downloaded yet.`);
  }
  if (payload.kind !== pkg.kind) {
    return refuse(
      'kind-mismatch',
      `${pkg.name} is listed as ${pkg.kind} but its payload is ${payload.kind}.`,
    );
  }
  if (payload.kind === 'app') {
    const problem = checkManifest(pkg, payload.manifest, context);
    if (problem !== null) return problem;
  }

  return {
    ok: true,
    plan: {
      id: pkg.id,
      name: pkg.name,
      version: pkg.version,
      prerequisites: [],
      resource: payload,
      capabilities: pkg.capabilities,
      summary: payloadSummary(pkg, payload),
    },
  };
}

/**
 * An app payload carries its own id and version. They have to be the package's
 * own, or the catalogue describes one program and installs another.
 */
function checkManifest(
  pkg: PayloadPackage,
  manifest: AppManifest,
  context: InstallContext,
): { ok: false; refusal: InstallRefusal; message: string } | null {
  if (shadowsBuiltIn(manifest.id, context)) {
    return refuse('built-in-id', BUILT_IN_MESSAGE(manifest.id));
  }
  if (manifest.id !== pkg.id) {
    return refuse(
      'id-mismatch',
      `The catalogue lists ${pkg.id}, but the download installs ${manifest.id}.`,
    );
  }
  if (manifest.version !== undefined && manifest.version !== pkg.version) {
    return refuse(
      'version-mismatch',
      `The catalogue offers ${pkg.version}, but the download is ${manifest.version}.`,
    );
  }
  return null;
}
