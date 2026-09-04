// deslop-ignore-file 19 the usage bars are pills, the shape the Progress atom uses
import { TRASH_DIR } from '@lumen/kernel';
import { usePlatform, useVfs } from '@lumen/kernel/react';
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
      title: 'Empty the Trash?',
      message: 'Items in the Trash are deleted permanently.',
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
      title: 'Restart required',
      message: `Files now live in ${next}. Restart Lumen OS to use the new location.`,
    });
  };

  const { usage, rows, loading } = state;
  const trash = rows.find((r) => r.path === TRASH_DIR);
  const largest = rows[0]?.size ?? 0;

  return (
    <SettingsPage title="Storage" description="What is using space in the file system.">
      <SettingsGroup title="Usage">
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
              <Progress value={usage.used / usage.quota} label="Storage used" className="flex-1" />
            ) : (
              <span className="text-sm text-ink-2">The host does not report a quota.</span>
            )}
            {loading ? (
              <Spinner size={14} />
            ) : (
              <IconButton label="Refresh" size="sm" onClick={() => void refresh()}>
                <RefreshCw />
              </IconButton>
            )}
          </div>
        </Row>
        <Row id="storage.breakdown" label="By folder" stacked>
          {rows.length === 0 && !loading ? (
            <p className="text-sm text-ink-2">The file system is empty.</p>
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
          label="Trash"
          description={trash ? `${formatBytes(trash.size)} in the Trash.` : 'The Trash is empty.'}
        >
          <Button
            size="sm"
            icon={<Trash2 className="size-3.5" />}
            disabled={!trash || trash.size === 0}
            onClick={() => void emptyTrash()}
          >
            Empty Trash…
          </Button>
        </Row>
      </SettingsGroup>

      {relocatable && (
        <SettingsGroup
          title="Home directory"
          description="Where Lumen OS keeps its files on this computer."
        >
          <Row id="storage.home" label="Location" stacked>
            <Value className="break-all">{hostHome ?? '…'}</Value>
            <div className="flex gap-2">
              <Button
                size="sm"
                icon={<FolderOpen className="size-3.5" />}
                onClick={() => void changeHome()}
              >
                Change location…
              </Button>
              <Button
                size="sm"
                icon={<ExternalLink className="size-3.5" />}
                onClick={() => void platform.shell.revealHome()}
              >
                Reveal in Explorer
              </Button>
            </div>
          </Row>
        </SettingsGroup>
      )}

      <SettingsGroup title="Details">
        <Row
          id="storage.details"
          label="Storage app"
          description="Largest files, file types and a folder-by-folder view."
        >
          <Button
            size="sm"
            icon={<HardDrive className="size-3.5" />}
            onClick={() => launch('lumen.storage')}
          >
            Open Storage
          </Button>
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}
