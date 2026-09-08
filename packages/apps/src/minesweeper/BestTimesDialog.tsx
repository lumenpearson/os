import { Button, Dialog } from '@lumen/ui';
import { formatDate } from '../_sdk';
import { DIFFICULTY_LABEL, PRESET_IDS, type PresetId } from './difficulty';
import { formatClock } from './labels';
import type { BestTime } from './storage';

export interface BestTimesDialogProps {
  best: Partial<Record<PresetId, BestTime>>;
  container: HTMLElement | null;
  onClose: () => void;
  onClear: () => void;
}

export function BestTimesDialog({ best, container, onClose, onClear }: BestTimesDialogProps) {
  const anyRecorded = PRESET_IDS.some((id) => best[id] !== undefined);
  return (
    <Dialog
      open
      onClose={onClose}
      title="Best Times"
      width={340}
      container={container}
      actions={
        <>
          <Button onClick={onClear} disabled={!anyRecorded}>
            Clear
          </Button>
          <Button variant="primary" data-autofocus onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <ul className="flex flex-col">
        {PRESET_IDS.map((id) => {
          const time = best[id];
          return (
            <li
              key={id}
              className="flex items-baseline justify-between gap-4 border-b border-rule py-2 last:border-b-0"
            >
              <span className="text-base text-ink">{DIFFICULTY_LABEL[id]}</span>
              <span className="flex items-baseline gap-3">
                {time && time.at > 0 && (
                  <span className="text-sm text-ink-3">{formatDate(time.at, 'short')}</span>
                )}
                <span className="mono tabular-nums text-base text-ink">
                  {time ? formatClock(time.ms) : '—'}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="pt-3 text-sm text-ink-3">
        A time is kept only for a game won on one of these three boards.
      </p>
    </Dialog>
  );
}
