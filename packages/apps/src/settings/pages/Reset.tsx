import { useSettingsStore } from '@lumen/kernel';
import { useKernel } from '@lumen/kernel/react';
import { Button, Dialog, Input, SettingsGroup, SettingsPage, useDialogs } from '@lumen/ui';
import { useState } from 'react';
import { useApp } from '../../_sdk';
import { Row } from '../Row';

const ERASE_WORD = 'ERASE';

export function ResetPage() {
  const kernel = useKernel();
  const dialogs = useDialogs();
  const { container } = useApp();
  const [eraseOpen, setEraseOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [erasing, setErasing] = useState(false);

  const restoreDefaults = async () => {
    const ok = await dialogs.confirm({
      title: 'Restore default settings?',
      message: 'Every preference returns to its default. Files and your account are kept.',
      confirmLabel: 'Restore',
      danger: true,
    });
    if (ok) useSettingsStore.getState().reset();
  };

  const erase = async () => {
    setErasing(true);
    await kernel.factoryReset();
  };

  return (
    <SettingsPage
      title="Reset"
      description="Return settings to their defaults, or wipe the system."
    >
      <SettingsGroup title="Settings">
        <Row
          id="reset.defaults"
          label="Restore default settings"
          description="Keeps your files and account."
        >
          <Button size="sm" onClick={() => void restoreDefaults()}>
            Restore defaults…
          </Button>
        </Row>
      </SettingsGroup>
      <SettingsGroup title="Everything">
        <Row
          id="reset.erase"
          label="Erase everything and start over"
          description="Deletes all files, the user account and every setting, then runs setup again."
        >
          <Button size="sm" variant="danger" onClick={() => setEraseOpen(true)}>
            Erase…
          </Button>
        </Row>
      </SettingsGroup>

      <Dialog
        open={eraseOpen}
        onClose={() => {
          if (!erasing) setEraseOpen(false);
        }}
        title="Erase everything?"
        container={container}
        persistent={erasing}
        actions={
          <>
            <Button onClick={() => setEraseOpen(false)} disabled={erasing}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={typed !== ERASE_WORD}
              loading={erasing}
              onClick={() => void erase()}
            >
              Erase everything
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-ink-2">
            All files, the user account and every setting are deleted. There is no undo. Type{' '}
            <span className="mono text-ink">{ERASE_WORD}</span> to continue.
          </p>
          <Input
            data-autofocus
            mono
            aria-label={`Type ${ERASE_WORD} to confirm`}
            placeholder={ERASE_WORD}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      </Dialog>
    </SettingsPage>
  );
}
