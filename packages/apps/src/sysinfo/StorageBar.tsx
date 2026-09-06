import { Progress } from '@lumen/ui';
import type { StorageReading } from './sections';
import { storageBar } from './view';

/**
 * Usage against the quota, when both numbers were reported. Where there is no
 * quota there is no bar: a bar with an invented end would be a picture of a
 * number nobody measured.
 */
export function StorageBar({ reading }: { reading: StorageReading | null }) {
  const bar = storageBar(reading);
  return (
    <div className="flex flex-col gap-1.5">
      {bar.fraction !== null && <Progress value={bar.fraction} label="Storage in use" />}
      <p className="mono text-sm tabular-nums text-ink-2">{bar.caption}</p>
      {bar.reason && <p className="text-sm text-ink-3">{bar.reason}</p>}
    </div>
  );
}
