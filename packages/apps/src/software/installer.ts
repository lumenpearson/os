/**
 * Running an install: what happens between pressing Get and the app being on
 * the system, in the order it happens and with a name for every step.
 *
 * The work is all in the store client — `fetchPackage`, `fetchPayload` (which
 * checks the length and the digest) and `planPackageInstall` (which refuses an
 * id the OS already owns, a payload of the wrong kind, or a bundle whose
 * members are not all in the catalogue). This module is the order of those
 * calls, the progress they report, and the row of state each one leaves
 * behind. Everything it touches arrives as a dependency, so a failing digest,
 * a member the store does not list and a machine with no network are all
 * ordinary tests rather than something to simulate with a server.
 *
 * A bundle has one row per member. The first failure stops the job: a bundle
 * that installs half of itself and says nothing is worse than one that stops
 * and names the package it stopped at.
 */

import { formatBytes } from '@lumen/vfs';
import {
  type FetchProgress,
  type InstallContext as PackageContext,
  type PackageDocument,
  type PackageKind,
  type InstallPlan as PackagePlan,
  type PackageSummary,
  type PayloadDocument,
  type PayloadPackage,
  planPackageInstall,
  type StoreResult,
  type VerifiedPayload,
} from './remote';

export type RowPhase =
  | 'queued'
  | 'reading'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'installed'
  | 'failed'
  | 'skipped';

/** What the row says it is doing. The verification step is named, not implied. */
export const PHASE_LABELS: Record<RowPhase, string> = {
  queued: 'Waiting',
  reading: 'Reading the package',
  downloading: 'Downloading',
  verifying: 'Checking size and sha256',
  installing: 'Installing',
  installed: 'Installed',
  failed: 'Failed',
  skipped: 'Not started',
};

export interface InstallRow {
  id: string;
  name: string;
  kind: PackageKind;
  phase: RowPhase;
  /** Bytes received. */
  loaded: number;
  /** Bytes expected, or null while the length is unknown. */
  total: number | null;
  /** What was done, or what went wrong. */
  message: string | null;
}

export interface InstallJob {
  /** The package that was asked for. */
  id: string;
  name: string;
  /** True when the rows are a bundle's members rather than the package itself. */
  bundle: boolean;
  rows: InstallRow[];
  state: 'running' | 'done' | 'failed';
  /** One sentence for the job as a whole, once it has ended. */
  message: string | null;
}

export interface CommitResult {
  ok: boolean;
  /** What was written, or why it could not be. */
  message: string;
}

export interface InstallerDeps {
  /** Every package the catalogue lists, so a bundle can be resolved. */
  catalogue: readonly PackageSummary[];
  /** Ids the kernel owns. A store package may not take one. */
  builtInIds: readonly string[];
  readPackage: (id: string) => Promise<StoreResult<PackageDocument>>;
  download: (
    pkg: PayloadPackage,
    onProgress: (progress: FetchProgress) => void,
  ) => Promise<StoreResult<VerifiedPayload>>;
  /** Writes it: the kernel for an app, the VFS for a typeface or an icon set. */
  commit: (
    plan: PackagePlan,
    document: PackageDocument,
    payload: PayloadDocument | null,
  ) => Promise<CommitResult>;
  /** Called on every change, including progress. */
  emit?: (job: InstallJob) => void;
}

function snapshot(job: InstallJob): InstallJob {
  return { ...job, rows: job.rows.map((row) => ({ ...row })) };
}

function row(id: string, name: string, kind: PackageKind): InstallRow {
  return { id, name, kind, phase: 'queued', loaded: 0, total: null, message: null };
}

interface Step {
  id: string;
  name: string;
  kind: PackageKind;
  /** The document, when the caller already has it. */
  document: PackageDocument | null;
}

/**
 * A bundle may name another bundle, and `resolveBundleMembers` will not expand
 * one whose document it has not been given. Reading them first turns that
 * refusal into an ordinary fetch, and the trail stops a bundle that contains
 * itself from being followed forever.
 */
async function readNestedBundles(
  members: readonly string[],
  summaries: ReadonlyMap<string, PackageSummary>,
  deps: InstallerDeps,
  seen: Set<string>,
): Promise<{ ok: true; documents: PackageDocument[] } | { ok: false; message: string }> {
  const documents: PackageDocument[] = [];
  for (const id of members) {
    const summary = summaries.get(id);
    if (summary === undefined || summary.kind !== 'bundle' || seen.has(id)) continue;
    seen.add(id);
    const read = await deps.readPackage(id);
    if (!read.ok) return { ok: false, message: read.error.message };
    documents.push(read.value);
    if (read.value.kind === 'bundle') {
      const nested = await readNestedBundles(read.value.members, summaries, deps, seen);
      if (!nested.ok) return nested;
      documents.push(...nested.documents);
    }
  }
  return { ok: true, documents };
}

async function installOne(
  step: Step,
  target: InstallRow,
  deps: InstallerDeps,
  context: PackageContext & { documents: PackageDocument[] },
  push: () => void,
): Promise<CommitResult> {
  let document = step.document;
  if (document === null) {
    target.phase = 'reading';
    push();
    const read = await deps.readPackage(step.id);
    if (!read.ok) return { ok: false, message: read.error.message };
    document = read.value;
    context.documents.push(document);
  }

  // The refusals that do not depend on the bytes — above all an id the OS
  // already owns — are worth knowing before a download is spent on them.
  const preflight = planPackageInstall(document, null, context);
  if (!preflight.ok && preflight.refusal !== 'missing-payload') {
    return { ok: false, message: preflight.message };
  }

  let payload: PayloadDocument | null = null;
  if (document.kind !== 'bundle') {
    const pkg: PayloadPackage = document;
    target.phase = 'downloading';
    target.loaded = 0;
    target.total = pkg.size;
    push();
    const got = await deps.download(pkg, (progress: FetchProgress) => {
      target.loaded = progress.loaded;
      target.total = progress.total ?? pkg.size;
      // Once every byte has arrived, what is left inside the fetch is the
      // length check, the sha256 and the parse — so the row says so.
      if (target.total !== null && target.loaded >= target.total) target.phase = 'verifying';
      push();
    });
    if (!got.ok) return { ok: false, message: got.error.message };
    payload = got.value.document;
    target.phase = 'verifying';
    target.loaded = got.value.size;
    target.total = got.value.size;
    push();
  }

  const planned = planPackageInstall(document, payload, context);
  if (!planned.ok) return { ok: false, message: planned.message };
  target.phase = 'installing';
  push();
  return deps.commit(planned.plan, document, payload);
}

/**
 * Install one package, or every member of one bundle in the order it lists
 * them. Resolves with the job in its final state; the same states are emitted
 * as it goes.
 */
export async function runInstall(
  rootDocument: PackageDocument,
  deps: InstallerDeps,
): Promise<InstallJob> {
  const emit = deps.emit ?? (() => {});
  const summaries = new Map(deps.catalogue.map((s) => [s.id, s]));
  const job: InstallJob = {
    id: rootDocument.id,
    name: rootDocument.name,
    bundle: rootDocument.kind === 'bundle',
    rows: [],
    state: 'running',
    message: null,
  };
  const push = () => emit(snapshot(job));
  const fail = (message: string): InstallJob => {
    job.state = 'failed';
    job.message = message;
    push();
    return snapshot(job);
  };

  const context: PackageContext & { documents: PackageDocument[] } = {
    catalogue: deps.catalogue,
    builtInIds: deps.builtInIds,
    documents: [],
  };

  let steps: Step[];
  let rootPlan: PackagePlan | null = null;

  if (rootDocument.kind === 'bundle') {
    const nested = await readNestedBundles(
      rootDocument.members,
      summaries,
      deps,
      new Set([rootDocument.id]),
    );
    if (!nested.ok) return fail(nested.message);
    context.documents.push(...nested.documents);
    const planned = planPackageInstall(rootDocument, null, context);
    if (!planned.ok) return fail(planned.message);
    rootPlan = planned.plan;
    steps = planned.plan.prerequisites.map((id) => {
      const summary = summaries.get(id);
      return { id, name: summary?.name ?? id, kind: summary?.kind ?? 'app', document: null };
    });
  } else {
    steps = [
      {
        id: rootDocument.id,
        name: rootDocument.name,
        kind: rootDocument.kind,
        document: rootDocument,
      },
    ];
  }

  job.rows = steps.map((step) => row(step.id, step.name, step.kind));
  push();

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const target = job.rows[index];
    if (step === undefined || target === undefined) continue;
    const outcome = await installOne(step, target, deps, context, push);
    if (!outcome.ok) {
      target.phase = 'failed';
      target.message = outcome.message;
      for (const rest of job.rows.slice(index + 1)) {
        if (rest.phase === 'queued') rest.phase = 'skipped';
      }
      return fail(
        job.bundle ? `${job.name} stopped at ${target.name}. ${outcome.message}` : outcome.message,
      );
    }
    target.phase = 'installed';
    target.message = outcome.message;
    push();
  }

  job.state = 'done';
  job.message = rootPlan?.summary ?? job.rows[0]?.message ?? null;
  push();
  return snapshot(job);
}

/** How far the download has got, or null while the length is unknown. */
export function progressRatio(target: InstallRow): number | null {
  if (target.phase === 'installed') return 1;
  if (target.total === null || target.total <= 0) return null;
  return Math.max(0, Math.min(1, target.loaded / target.total));
}

/** "1.2 MB of 4.7 MB", or the size alone once there is nothing left to receive. */
export function progressLabel(target: InstallRow): string {
  if (target.total === null) return formatBytes(target.loaded);
  if (target.phase === 'downloading') {
    return `${formatBytes(target.loaded)} of ${formatBytes(target.total)}`;
  }
  return formatBytes(target.total);
}

export function rowStatus(target: InstallRow): string {
  if (target.phase === 'failed' || target.phase === 'installed') {
    return target.message ?? PHASE_LABELS[target.phase];
  }
  return PHASE_LABELS[target.phase];
}

/**
 * Everything about a job except the byte counts. The counts move far more
 * often than anything else and are written to the DOM directly, so this is
 * what a React render actually depends on.
 */
export function jobSignature(job: InstallJob): string {
  const rows = job.rows.map((r) => `${r.id}:${r.phase}:${r.message ?? ''}`).join('|');
  return `${job.state}:${job.message ?? ''}:${rows}`;
}

export function jobIsBusy(job: InstallJob): boolean {
  return job.state === 'running';
}
