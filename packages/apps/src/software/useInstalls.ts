/**
 * Running installs, and what they leave on the system.
 *
 * The runner is `installer.ts`; this binds it to the machine: the store client
 * for the bytes, `planInstall` and `Kernel.installApp` for an app — the same
 * road a `.app` file dropped on the window takes — and the VFS for a typeface
 * or an icon set, which the kernel has no register for.
 *
 * Job state is kept in a ref and published to React only when a phase or a
 * message changes. Byte counts arrive far too often for that, so a component
 * that wants them subscribes and writes them to the DOM itself, inside a frame.
 */

import { useApps, useInstalledApps, useKernel, useVfs } from '@lumen/kernel/react';
import { useLatest } from '@lumen/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { planInstall } from './install';
import { type InstallerDeps, type InstallJob, jobSignature, runInstall } from './installer';
import {
  fetchPackage,
  fetchPayload,
  type PackageDocument,
  type PackageSummary,
  type PayloadDocument,
} from './remote';
import {
  describeResource,
  emptyRecord,
  type InstalledResource,
  type ResourceRecord,
  readRecord,
  recordPath,
  resourceDocument,
  resourcePath,
  withResource,
} from './resources';

export type JobListener = (job: InstallJob) => void;

export interface InstallsController {
  /** Every job started this session, in the order they were started. */
  jobs: InstallJob[];
  /** Typefaces and icon sets written by this account. */
  resources: ResourceRecord;
  start: (document: PackageDocument) => void;
  /** Stop a running job at the next chunk. */
  stop: (id: string) => void;
  /** Take a finished job off the list. */
  dismiss: (id: string) => void;
  /** Called on every change, byte counts included. Returns the unsubscribe. */
  subscribe: (listener: JobListener) => () => void;
}

function detailOf(resource: PayloadDocument): string {
  if (resource.kind === 'font') {
    const faces = resource.font.faces.length;
    return faces === 1 ? '1 weight' : `${faces} weights`;
  }
  if (resource.kind === 'icons') {
    const count = Object.keys(resource.icons.icons).length;
    return count === 1 ? '1 icon' : `${count} icons`;
  }
  return 'an app';
}

export function useInstalls(options: {
  base: string;
  catalogue: readonly PackageSummary[];
}): InstallsController {
  const kernel = useKernel();
  const vfs = useVfs();
  const registered = useApps({ includeHidden: true });
  const installed = useInstalledApps();
  const [record, setRecord] = useState<ResourceRecord>(emptyRecord);
  const [jobs, setJobs] = useState<InstallJob[]>([]);

  const builtInIds = useMemo(() => registered.map((app) => app.id), [registered]);
  const builtInRef = useLatest(builtInIds);
  const installedRef = useLatest(installed);
  const recordRef = useLatest(record);
  const catalogueRef = useLatest(options.catalogue);
  const baseRef = useLatest(options.base);

  const store = useRef(new Map<string, InstallJob>());
  const signatures = useRef(new Map<string, string>());
  const listeners = useRef(new Set<JobListener>());
  const controllers = useRef(new Map<string, AbortController>());

  useEffect(() => {
    let cancelled = false;
    vfs
      .readJson<unknown>(recordPath(kernel.home))
      .then((value) => !cancelled && setRecord(readRecord(value)))
      .catch(() => {
        /* nothing installed from a store yet */
      });
    return () => {
      cancelled = true;
    };
  }, [vfs, kernel.home]);

  const subscribe = useCallback((listener: JobListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const emit = useCallback((job: InstallJob) => {
    store.current.set(job.id, job);
    for (const listener of listeners.current) listener(job);
    const signature = jobSignature(job);
    if (signatures.current.get(job.id) === signature) return;
    signatures.current.set(job.id, signature);
    setJobs([...store.current.values()]);
  }, []);

  const commit = useCallback<InstallerDeps['commit']>(
    async (plan) => {
      const resource = plan.resource;
      // A bundle installs its members and has nothing of its own to write.
      if (resource === null) return { ok: true, message: plan.summary };

      if (resource.kind === 'app') {
        const decision = planInstall(resource.manifest, {
          builtInIds: builtInRef.current,
          installed: installedRef.current,
        });
        if (decision.action === 'blocked') return { ok: false, message: decision.summary };
        try {
          for (const path of decision.removePaths) await vfs.trash(path);
          const written = await kernel.installApp(resource.manifest);
          return {
            ok: true,
            message:
              decision.action === 'replace'
                ? `Replaced the installed copy. The manifest is ${written}.`
                : `Written to ${written}.`,
          };
        } catch (e) {
          return { ok: false, message: e instanceof Error ? e.message : String(e) };
        }
      }

      const kind = resource.kind;
      const path = resourcePath(kernel.home, kind, plan.id);
      const entry: InstalledResource = {
        id: plan.id,
        kind,
        name: plan.name,
        version: plan.version,
        path,
        installedAt: Date.now(),
      };
      try {
        await vfs.writeJson(path, resourceDocument(plan.id, plan.version, resource), {
          recursive: true,
        });
        const merged = withResource(recordRef.current, entry);
        recordRef.current = merged;
        setRecord(merged);
        await vfs.writeJson(recordPath(kernel.home), merged, { recursive: true });
        return { ok: true, message: describeResource(entry, detailOf(resource)) };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      }
    },
    [kernel, vfs, builtInRef, installedRef, recordRef],
  );

  const start = useCallback(
    (document: PackageDocument) => {
      if (store.current.get(document.id)?.state === 'running') return;
      const controller = new AbortController();
      controllers.current.set(document.id, controller);
      const base = baseRef.current;
      const deps: InstallerDeps = {
        catalogue: catalogueRef.current,
        builtInIds: builtInRef.current,
        readPackage: (id) => fetchPackage(base, id, { signal: controller.signal }),
        download: (pkg, onProgress) =>
          fetchPayload(base, pkg, { signal: controller.signal, onProgress }),
        commit,
        emit,
      };
      void runInstall(document, deps).finally(() => {
        controllers.current.delete(document.id);
      });
    },
    [baseRef, catalogueRef, builtInRef, commit, emit],
  );

  const stop = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
  }, []);

  const dismiss = useCallback((id: string) => {
    const job = store.current.get(id);
    if (job === undefined || job.state === 'running') return;
    store.current.delete(id);
    signatures.current.delete(id);
    setJobs([...store.current.values()]);
  }, []);

  useEffect(() => {
    const running = controllers.current;
    return () => {
      for (const controller of running.values()) controller.abort();
    };
  }, []);

  return { jobs, resources: record, start, stop, dismiss, subscribe };
}
