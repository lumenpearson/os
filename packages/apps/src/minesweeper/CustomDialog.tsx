import { Button, Dialog, Field, Input } from '@lumen/ui';
import { type FormEvent, useId, useState } from 'react';
import { type BoardConfig, type CustomDraft, LIMITS, maxMines, validateCustom } from './difficulty';

export interface CustomDialogProps {
  initial: BoardConfig;
  container: HTMLElement | null;
  onCancel: () => void;
  onStart: (config: BoardConfig) => void;
}

/** Type a board. Nothing is clamped; a value out of range says why. */
export function CustomDialog({ initial, container, onCancel, onStart }: CustomDialogProps) {
  const formId = useId();
  const widthId = useId();
  const heightId = useId();
  const minesId = useId();
  const [draft, setDraft] = useState<CustomDraft>({
    width: String(initial.width),
    height: String(initial.height),
    mines: String(initial.mines),
  });

  const result = validateCustom(draft);
  const errors = result.ok ? {} : result.errors;
  const set = (part: Partial<CustomDraft>) => setDraft((current) => ({ ...current, ...part }));

  // The two sides on their own decide the mine range, so the hint can stand
  // even while the mine field itself is empty or out of range.
  const sides = validateCustom({ ...draft, mines: String(LIMITS.minMines) });
  const hint = sides.ok
    ? `${LIMITS.minMines} to ${maxMines(sides.config.width, sides.config.height)} mines.`
    : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (result.ok) onStart(result.config);
  };

  return (
    <Dialog
      open
      onClose={onCancel}
      title="Custom Board"
      width={340}
      container={container}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary" disabled={!result.ok}>
            Start
          </Button>
        </>
      }
    >
      <form id={formId} className="flex flex-col gap-3 pb-1" onSubmit={submit}>
        <Field label="Width" htmlFor={widthId} error={errors.width}>
          <Input
            id={widthId}
            mono
            inputMode="numeric"
            autoComplete="off"
            data-autofocus
            invalid={errors.width !== undefined}
            value={draft.width}
            onChange={(event) => set({ width: event.target.value })}
          />
        </Field>
        <Field label="Height" htmlFor={heightId} error={errors.height}>
          <Input
            id={heightId}
            mono
            inputMode="numeric"
            autoComplete="off"
            invalid={errors.height !== undefined}
            value={draft.height}
            onChange={(event) => set({ height: event.target.value })}
          />
        </Field>
        <Field label="Mines" htmlFor={minesId} hint={hint} error={errors.mines}>
          <Input
            id={minesId}
            mono
            inputMode="numeric"
            autoComplete="off"
            invalid={errors.mines !== undefined}
            value={draft.mines}
            onChange={(event) => set({ mines: event.target.value })}
          />
        </Field>
      </form>
    </Dialog>
  );
}
