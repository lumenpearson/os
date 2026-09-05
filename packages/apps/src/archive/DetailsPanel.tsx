/**
 * What is known about the archive, or about the one entry that is selected.
 * The checksum, the method and the packed size come straight out of the
 * central directory; the extraction note comes from the name sanitiser, and
 * is the only place a user ever sees that an entry wanted to be written
 * somewhere it is not allowed to go.
 */

import type { ReactNode } from 'react';
import { formatDateTime } from '../_sdk';
import { formatCrc } from './crc32';
import { sanitizeEntryName } from './entryPath';
import { type ArchiveTotals, formatRatio, formatSize, methodLabel, summarize } from './format';
import type { ArchiveNode } from './tree';
import type { ZipEntry } from './zip';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[68px_1fr] items-baseline gap-x-3 gap-y-0.5">
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="mono truncate-1 text-sm text-ink tabular-nums">{children}</dd>
    </div>
  );
}

export interface DetailsPanelProps {
  width: number;
  path: string;
  fileSize: number;
  totals: ArchiveTotals;
  comment: string;
  node: ArchiveNode | null;
  entry: ZipEntry | null;
  exactBytes: boolean;
}

export function DetailsPanel({
  width,
  path,
  fileSize,
  totals,
  comment,
  node,
  entry,
  exactBytes,
}: DetailsPanelProps) {
  const rewritten = entry ? sanitizeEntryName(entry.name) : null;
  return (
    <aside
      aria-label="Details"
      style={{ width }}
      className="lumen-scroll shrink-0 border-l border-rule bg-surface"
    >
      <div className="flex flex-col gap-5 p-3">
        <section className="flex flex-col gap-1.5">
          <h2 className="text-md font-medium text-ink">Archive</h2>
          <dl className="flex flex-col gap-0.5">
            <Row label="File">{path}</Row>
            <Row label="On disk">{formatSize(fileSize, exactBytes)}</Row>
            <Row label="Contents">{summarize(totals, exactBytes)}</Row>
            {comment !== '' && <Row label="Comment">{comment}</Row>}
          </dl>
        </section>

        {node && (
          <section className="flex flex-col gap-1.5">
            <h2 className="text-md font-medium text-ink">
              {node.isDirectory ? 'Folder' : 'Entry'}
            </h2>
            <dl className="flex flex-col gap-0.5">
              <Row label="Path">{node.path}</Row>
              {node.isDirectory ? (
                <Row label="Holds">{`${node.files} ${node.files === 1 ? 'file' : 'files'}`}</Row>
              ) : null}
              <Row label="Size">{formatSize(node.size, exactBytes)}</Row>
              <Row label="Packed">{formatSize(node.packed, exactBytes)}</Row>
              <Row label="Ratio">{formatRatio(node.size, node.packed)}</Row>
              {entry && <Row label="Method">{methodLabel(entry.method)}</Row>}
              {entry && !entry.isDirectory && <Row label="CRC-32">{formatCrc(entry.crc)}</Row>}
              <Row label="Modified">
                {node.modifiedAt > 0 ? formatDateTime(node.modifiedAt) : 'Not recorded'}
              </Row>
              {entry?.comment ? <Row label="Comment">{entry.comment}</Row> : null}
            </dl>
          </section>
        )}

        {entry && rewritten !== entry.name.replace(/\/+$/, '') && (
          <section className="flex flex-col gap-1 border-t border-rule pt-3">
            <h2 className="text-md font-medium text-ink">Extraction</h2>
            <p className="text-sm text-ink-2">
              {rewritten === null
                ? 'This entry has no usable name and will be skipped.'
                : 'This name would write outside the destination, so it is extracted as:'}
            </p>
            {rewritten !== null && <p className="mono text-sm text-ink">{rewritten}</p>}
          </section>
        )}

        {entry?.encrypted && (
          <p className="text-sm text-danger">
            This entry is encrypted. Archive Utility cannot decrypt it.
          </p>
        )}
      </div>
    </aside>
  );
}
