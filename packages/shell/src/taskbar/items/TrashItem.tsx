/**
 * The Recycle Bin: opens Files at /Trash, and says whether anything is in it.
 * The count comes from reading the folder, and follows it — emptying the bin
 * in Files changes the icon here without a reload.
 */

import { TRASH_DIR } from '@lumen/kernel';
import { useKernel, usePlural, useT, useVfs } from '@lumen/kernel/react';
import { cx, Tooltip } from '@lumen/ui';
import { isInside } from '@lumen/vfs';
import { Trash, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { groupClass, ITEM_BUTTON, type TaskbarItemProps, tooltipSide } from './types';

export function TrashItem({ size, vertical, position }: TaskbarItemProps) {
  const t = useT();
  const plural = usePlural();
  const kernel = useKernel();
  const vfs = useVfs();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let live = true;
    const read = () => {
      vfs
        .readDir(TRASH_DIR)
        .then((entries) => {
          if (live) setCount(entries.filter((e) => !e.name.startsWith('.')).length);
        })
        .catch(() => {
          if (live) setCount(0);
        });
    };
    read();
    const off = vfs.subscribe((event) => {
      const touches = (p: string | undefined) => Boolean(p && isInside(TRASH_DIR, p, true));
      if (touches(event.path) || touches(event.to)) read();
    });
    return () => {
      live = false;
      off();
    };
  }, [vfs]);

  const full = count > 0;
  const label = full ? plural('taskbar.trash', count) : t('taskbar.trashEmpty');
  const Icon = full ? Trash2 : Trash;

  return (
    <div data-taskbar-item="trash" className={groupClass(vertical)}>
      <Tooltip content={label} side={tooltipSide(position)}>
        <button
          type="button"
          aria-label={label}
          data-testid="taskbar-trash"
          data-taskbar-icon=""
          data-full={full}
          onClick={() => void kernel.launch('lumen.files', { path: TRASH_DIR })}
          className={cx(ITEM_BUTTON, 'hover:bg-surface-2/70')}
          style={{ width: size, height: size }}
        >
          <span
            data-taskbar-glyph=""
            className={cx(
              'flex items-center justify-center',
              position === 'bottom' && 'origin-bottom',
              position === 'left' && 'origin-left',
              position === 'right' && 'origin-right',
            )}
          >
            <Icon size={Math.round(size * 0.44)} strokeWidth={1.75} />
          </span>
        </button>
      </Tooltip>
    </div>
  );
}
