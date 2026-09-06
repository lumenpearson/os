import { useVfs } from '@lumen/kernel/react';
import { Button, TextArea } from '@lumen/ui';
import { FileUp, FolderOpen } from 'lucide-react';
import { type DragEvent, type RefObject, useCallback, useRef } from 'react';
import {
  hasDropPayload,
  isManifestName,
  LUMEN_PATHS_MIME,
  parseDroppedPaths,
  pickManifest,
} from './drop';
import type { InstallPlan } from './install';
import type { ManifestReport } from './manifest';
import { errorsOf } from './manifest';
import { ReportView } from './Report';

export interface InstallSectionProps {
  draft: string;
  /** Where the text came from: a VFS path, a dropped file name, or null. */
  origin: string | null;
  report: ManifestReport;
  plan: InstallPlan | null;
  busy: boolean;
  onDraft: (text: string, origin: string | null) => void;
  onChooseFile: () => void;
  onInstall: () => void;
  /** A dropped file that could not be read. */
  onError: (message: string) => void;
  textRef: RefObject<HTMLTextAreaElement | null>;
}

export function InstallSection({
  draft,
  origin,
  report,
  plan,
  busy,
  onDraft,
  onChooseFile,
  onInstall,
  onError,
  textRef,
}: InstallSectionProps) {
  const vfs = useVfs();
  const zone = useRef<HTMLDivElement>(null);
  const depth = useRef(0);

  // Dragging is pointer-rate, so the highlight is written straight to the DOM.
  const mark = useCallback((dragging: boolean) => {
    const el = zone.current;
    if (el) el.dataset.dragging = dragging ? 'true' : 'false';
  }, []);

  const onDragEnter = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!hasDropPayload([...e.dataTransfer.types])) return;
      depth.current += 1;
      mark(true);
    },
    [mark],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!hasDropPayload([...e.dataTransfer.types])) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const onDragLeave = useCallback(() => {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) mark(false);
  }, [mark]);

  const onDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      depth.current = 0;
      mark(false);
      const types = [...e.dataTransfer.types];
      try {
        if (types.includes(LUMEN_PATHS_MIME)) {
          const path = pickManifest(parseDroppedPaths(e.dataTransfer.getData(LUMEN_PATHS_MIME)));
          if (!path) return;
          onDraft(await vfs.readText(path), path);
          return;
        }
        const files = [...e.dataTransfer.files];
        const file = files.find((f) => isManifestName(f.name)) ?? files[0];
        if (!file) return;
        onDraft(await file.text(), file.name);
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
      }
    },
    [vfs, mark, onDraft, onError],
  );

  const errors = errorsOf(report.issues);
  const blocked = plan?.action === 'blocked';
  const canInstall = Boolean(report.manifest) && plan !== null && !blocked && !busy;
  const trimmed = draft.trim();

  return (
    <div className="lumen-scroll min-h-0 flex-1">
      <div className="mx-auto flex max-w-2xl flex-col gap-7 px-4 py-5">
        <section className="flex flex-col gap-2">
          <h2 className="text-md font-medium text-ink">From a file</h2>
          <p className="text-base text-ink-2">
            A pseudo-program is one JSON file with the extension <span className="mono">.app</span>.
            Drop one here, or choose it from the file system. Nothing is installed until you have
            read the report.
          </p>
          <div
            ref={zone}
            data-dragging="false"
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={(e) => {
              void onDrop(e);
            }}
            className={[
              'mt-1 flex flex-col items-center gap-2 rounded-md border border-dashed border-rule-strong bg-canvas px-4 py-6 text-center',
              'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
              'data-[dragging=true]:border-accent data-[dragging=true]:bg-selection',
            ].join(' ')}
          >
            <FileUp aria-hidden className="size-5 text-ink-3" />
            <p className="text-base text-ink-2">
              Drop a <span className="mono">.app</span> file
            </p>
            <Button icon={<FolderOpen />} onClick={onChooseFile}>
              Choose File…
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-md font-medium text-ink">Paste a manifest</h2>
          <p className="text-base text-ink-2">
            Paste or write the JSON. It is checked as you type.
          </p>
          <TextArea
            ref={textRef}
            mono
            rows={8}
            spellCheck={false}
            aria-label="Manifest JSON"
            placeholder={
              '{\n  "id": "user.example",\n  "name": "Example",\n  "html": "<h1>Hello</h1>"\n}'
            }
            value={draft}
            onChange={(e) => onDraft(e.target.value, null)}
          />
        </section>

        {trimmed.length > 0 && (
          <section className="flex flex-col gap-4 rounded-md border border-rule bg-surface p-3">
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-md font-medium text-ink">
                  {report.manifest?.name ?? 'This manifest'}
                </h2>
                <p className="mono truncate text-sm text-ink-3">{origin ?? 'pasted by hand'}</p>
              </div>
              <Button variant="primary" disabled={!canInstall} loading={busy} onClick={onInstall}>
                {plan?.action === 'replace' ? 'Replace' : 'Install'}
              </Button>
            </header>

            <ReportView report={report} />

            {plan && (
              <p className={blocked ? 'text-base text-danger' : 'text-base text-ink-2'}>
                {plan.summary}
              </p>
            )}
            {errors.length > 0 && (
              <p className="text-base text-ink-2">
                Fix the {errors.length === 1 ? 'problem' : 'problems'} above and the manifest can be
                installed.
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
