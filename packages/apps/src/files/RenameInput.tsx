import { useVfs } from '@lumen/kernel/react';
import { cx } from '@lumen/ui';
import { basename, dirname } from '@lumen/vfs';
import { useEffect, useRef, useState } from 'react';
import { validateName } from './logic';

export interface RenameInputProps {
  path: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
  align?: 'left' | 'center';
  className?: string;
}

/**
 * Replaces an item's name in place. The stem is pre-selected; Enter commits,
 * Escape cancels, leaving the field commits when the name is valid.
 */
export function RenameInput({ path, onCommit, onCancel, align = 'left', className }: RenameInputProps) {
  const vfs = useVfs();
  const name = basename(path);
  const [value, setValue] = useState(name);
  const [siblings, setSiblings] = useState<string[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    let cancelled = false;
    vfs
      .readDir(dirname(path))
      .then((list) => {
        if (!cancelled) setSiblings(list.map((e) => e.name));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vfs, path]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(0, basename(name, true).length);
  }, [name]);

  const error = value === name ? null : validateName(value, siblings, name);

  const finish = (mode: 'commit' | 'cancel' | 'blur') => {
    if (done.current) return;
    if (mode === 'commit' && error) return;
    done.current = true;
    if (mode === 'cancel' || value === name || error) onCancel();
    else onCommit(value);
  };

  return (
    <div className={cx('relative min-w-0 flex-1', className)}>
      <input
        ref={ref}
        value={value}
        aria-label="New name"
        aria-invalid={error ? true : undefined}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            finish('commit');
          } else if (e.key === 'Escape') {
            e.preventDefault();
            finish('cancel');
          }
        }}
        onBlur={() => finish('blur')}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onDragStart={(e) => e.preventDefault()}
        className={cx(
          'lumen-control h-5 w-full px-1 text-base leading-4',
          error && 'border-danger',
          align === 'center' && 'text-center',
        )}
      />
      {error && (
        <p
          role="alert"
          className={cx(
            'absolute top-full z-10 mt-1 w-max max-w-56 rounded-xs border border-rule bg-surface px-1.5 py-0.5 text-left text-xs text-danger shadow-sm',
            align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0',
          )}
        >
          {error}
        </p>
      )}
    </div>
  );
}
