import { useSettingsStore } from '@lumen/kernel';
import { useKernel, useT } from '@lumen/kernel/react';
import { Button, Dialog, Input, SettingsGroup, SettingsPage, useDialogs } from '@lumen/ui';
import { useState } from 'react';
import { useApp } from '../../_sdk';
import { Row } from '../Row';

const ERASE_WORD = 'ERASE';

export function ResetPage() {
  const t = useT();
  const kernel = useKernel();
  const dialogs = useDialogs();
  const { container } = useApp();
  const [eraseOpen, setEraseOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [erasing, setErasing] = useState(false);

  const restoreDefaults = async () => {
    const ok = await dialogs.confirm({
      title: t('resetPage.restoreConfirm'),
      message: t('resetPage.everyPreferenceKept'),
      confirmLabel: t('resetPage.restore'),
      danger: true,
    });
    if (ok) useSettingsStore.getState().reset();
  };

  const erase = async () => {
    setErasing(true);
    await kernel.factoryReset();
  };

  return (
    <SettingsPage title={t('settings.reset')} description={t('resetPage.intro')}>
      <SettingsGroup title={t('resetPage.settings')}>
        <Row
          id="reset.defaults"
          label={t('resetPage.restoreDefaults')}
          description={t('resetPage.restoreDefaultsHint')}
        >
          <Button size="sm" onClick={() => void restoreDefaults()}>
            {t('resetPage.restoreButton')}
          </Button>
        </Row>
      </SettingsGroup>
      <SettingsGroup title={t('resetPage.everything')}>
        <Row
          id="reset.erase"
          label={t('resetPage.eraseEverything')}
          description={t('resetPage.eraseEverythingHint')}
        >
          <Button size="sm" variant="danger" onClick={() => setEraseOpen(true)}>
            {t('resetPage.eraseButton')}
          </Button>
        </Row>
      </SettingsGroup>

      <Dialog
        open={eraseOpen}
        onClose={() => {
          if (!erasing) setEraseOpen(false);
        }}
        title={t('resetPage.eraseConfirm')}
        container={container}
        persistent={erasing}
        actions={
          <>
            <Button onClick={() => setEraseOpen(false)} disabled={erasing}>
              {t('action.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={typed !== ERASE_WORD}
              loading={erasing}
              onClick={() => void erase()}
            >
              {t('resetPage.eraseConfirmButton')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-ink-2">
            {t('resetPage.eraseExplains')} <span className="mono text-ink">{ERASE_WORD}</span>{' '}
            {t('resetPage.toContinue')}
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
