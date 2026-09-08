// deslop-ignore-file 19 the usage bars are pills, the shape the Progress atom uses
import { TRASH_DIR } from '@lumen/kernel';
import { usePlatform, useT, useVfs } from '@lumen/kernel/react';
import {
  Button,
  IconButton,
  Progress,
  SettingsGroup,
  SettingsPage,
  Spinner,
  useDialogs,
} from '@lumen/ui';
import { formatBytes } from '@lumen/vfs';
import { ExternalLink, FolderOpen, HardDrive, RefreshCw, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useLauncher } from '../../_sdk';
import { type BreakdownRow, type FolderSize, storageBreakdown } from '../logic';
import { Row, Value } from '../Row';

interface StorageState {
  usage: { used: number; quota: number | null } | null;
  rows: BreakdownRow[];
  loading: boolean;
}

export function StoragePage() {
  const t = useT();
  const vfs = useVfs();
  const platform = usePlatform();
  const dialogs = useDialogs();
  const { launch } = useLauncher();
  const [state, setState] = useState<StorageState>({ usage: null, rows: [], loading: true });
  const [hostHome, setHostHome] = useState<string | null>(null);
  const relocatable = platform.capabilities.relocatableHome;

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const [usage, entries] = await Promise.all([vfs.usage(), vfs.readDir('/')]);
      const sizes: FolderSize[] = await Promise.all(
        entries.map(async (e) => ({
          name: e.name,
          path: e.path,
          size: await vfs.du(e.path).catch(() => 0),
        })),
      );
      setState({ usage, rows: storageBreakdown(sizes), loading: false });
    } catch {
      setState({ usage: null, rows: [], loading: false });
    }
  }, [vfs]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!relocatable) return;
    let live = true;
    platform.config
      .get()
      .then((c) => live && setHostHome(c.homeDir))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [platform, relocatable]);

  const emptyTrash = async () => {
    const ok = await dialogs.confirm({
      title: t('storagePage.emptyTrashConfirm'),
      message: t('storagePage.trashPermanent'),
      confirmLabel: 'Empty Trash',
      danger: true,
    });
    if (!ok) return;
    await vfs.emptyTrash();
    await refresh();
  };

  const changeHome = async () => {
    const next = await platform.config.pickHomeDir();
    if (!next) return;
    setHostHome(next);
    await dialogs.alert({
      title: t('storagePage.restartRequired'),
      message: `Files now live in ${next}. Restart Lumen OS to use the new location.`,
    });
  };

  const { usage, rows, loading } = state;
  const trash = rows.find((r) => r.path === TRASH_DIR);
  const largest = rows[0]?.size ?? 0;

  return (
    <SettingsPage title={t('settings.storage')} description={t('storagePage.intro')}>
      <SettingsGroup title={t('storagePage.usage')}>
        <Row
          id="storage.usage"
          label={
            usage?.quota
              ? `${formatBytes(usage.used)} of ${formatBytes(usage.quota)} used`
              : `${formatBytes(usage?.used ?? 0)} used`
          }
          stacked
        >
          <div className="flex w-full items-center gap-3">
            {usage?.quota ? (
              <Progress
                value={usage.used / usage.quota}
                label={t('storagePage.used')}
                className="flex-1"
              />
            ) : (
              <span className="text-sm text-ink-2">{t('storagePage.noQuota')}</span>
            )}
            {loading ? (
              <Spinner size={14} />
            ) : (
              <IconButton label={t('storagePage.refresh')} size="sm" onClick={() => void refresh()}>
                <RefreshCw />
              </IconButton>
            )}
          </div>
        </Row>
        <Row id="storage.breakdown" label={t('storagePage.byFolder')} stacked>
          {rows.length === 0 && !loading ? (
            <p className="text-sm text-ink-2">{t('storagePage.empty')}</p>
          ) : (
            <table className="w-full border-collapse text-base">
              <tbody className="divide-y divide-rule">
                {rows.map((r) => (
                  <tr key={r.path}>
                    <td className="w-40 py-1 pr-3 text-ink">{r.name}</td>
                    <td className="py-1 pr-3">
                      <div
                        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
                        aria-hidden
                      >
                        <div
                          className="h-full rounded-full bg-ink-3"
                          style={{ width: `${largest > 0 ? (r.size / largest) * 100 : 0}%` }}
                        />
                      </div>
                    </td>
                    <td className="mono w-20 py-1 text-right text-sm text-ink-2 tabular-nums">
                      {formatBytes(r.size)}
                    </td>
                    <td className="mono w-12 py-1 text-right text-xs text-ink-3 tabular-nums">
                      {Math.round(r.fraction * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Row>
        <Row
          id="storage.trash"
          label={t('storagePage.trash')}
          description={trash ? `${formatBytes(trash.size)} in the Trash.` : 'The Trash is empty.'}
        >
          <Button
            size="sm"
            icon={<Trash2 className="size-3.5" />}
            disabled={!trash || trash.size === 0}
            onClick={() => void emptyTrash()}
          >
            {t('storagePage.emptyTrashButton')}
          </Button>
        </Row>
      </SettingsGroup>

      {relocatable && (
        <SettingsGroup
          title={t('storagePage.homeDirectory')}
          description={t('storagePage.homeDirectoryHint')}
        >
          <Row id="storage.home" label={t('storagePage.location')} stacked>
            <Value className="break-all">{hostHome ?? '…'}</Value>
            <div className="flex gap-2">
              <Button
                size="sm"
                icon={<FolderOpen className="size-3.5" />}
                onClick={() => void changeHome()}
              >
                {t('storagePage.changeLocation')}
              </Button>
              <Button
                size="sm"
                icon={<ExternalLink className="size-3.5" />}
                onClick={() => void platform.shell.revealHome()}
              >
                {t('storagePage.revealInExplorer')}
              </Button>
            </div>
          </Row>
        </SettingsGroup>
      )}

      <SettingsGroup title={t('storagePage.details')}>
        <Row
          id="storage.details"
          label={t('storagePage.storageApp')}
          description={t('storagePage.storageAppHint')}
        >
          <Button
            size="sm"
            icon={<HardDrive className="size-3.5" />}
            onClick={() => launch('lumen.storage')}
          >
            {t('storagePage.openStorage')}
          </Button>
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}
