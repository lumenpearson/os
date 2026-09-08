import type { FilesView, Translate } from '@lumen/kernel';
import { useKernel, useSetting, useT } from '@lumen/kernel/react';
import { Button, Select, type SelectOption, SettingsGroup, SettingsPage, Switch } from '@lumen/ui';
import { FolderOpen } from 'lucide-react';
import { useFilePicker } from '../../_sdk';
import { Row, Value } from '../Row';

/*
 * A function of the translator, not a table built at import: a table would
 * keep whatever language was in force when the module first loaded.
 */
const viewOptions = (t: Translate): SelectOption<FilesView>[] => [
  { value: 'list', label: t('filesPage.viewList') },
  { value: 'grid', label: t('filesPage.viewGrid') },
  { value: 'columns', label: t('filesPage.viewColumns') },
  { value: 'cards', label: t('filesPage.viewCards') },
];

export function FilesPage() {
  const t = useT();
  const kernel = useKernel();
  const [files, patch] = useSetting('files');
  const pick = useFilePicker();
  const home = files.home || kernel.home;

  const chooseHome = async () => {
    const result = await pick({ mode: 'folder', title: t('filesPage.chooseHome'), startDir: home });
    const path = Array.isArray(result) ? result[0] : result;
    if (path) patch({ home: path });
  };

  return (
    <SettingsPage title={t('settings.files')} description={t('filesPage.intro')}>
      <SettingsGroup title={t('filesPage.listing')}>
        <Row
          id="files.hidden"
          label={t('filesPage.showHidden')}
          description={t('filesPage.showHiddenHint')}
        >
          <Switch
            checked={files.showHidden}
            onChange={(e) => patch({ showHidden: e.target.checked })}
          />
        </Row>
        <Row id="files.extensions" label={t('filesPage.showExtensions')}>
          <Switch
            checked={files.showExtensions}
            onChange={(e) => patch({ showExtensions: e.target.checked })}
          />
        </Row>
        <Row
          id="files.foldersFirst"
          label={t('filesPage.foldersFirst')}
          description={t('filesPage.foldersFirstHint')}
        >
          <Switch
            checked={files.foldersFirst}
            onChange={(e) => patch({ foldersFirst: e.target.checked })}
          />
        </Row>
        <Row id="files.view" label={t('filesPage.defaultView')}>
          <Select
            options={viewOptions(t)}
            value={files.defaultView}
            onChange={(defaultView) => patch({ defaultView })}
          />
        </Row>
      </SettingsGroup>
      <SettingsGroup title={t('filesPage.behaviour')}>
        <Row id="files.confirmDelete" label={t('filesPage.confirmTrash')}>
          <Switch
            checked={files.confirmDelete}
            onChange={(e) => patch({ confirmDelete: e.target.checked })}
          />
        </Row>
        <Row
          id="files.singleClick"
          label={t('filesPage.singleClick')}
          description={t('filesPage.singleClickHint')}
        >
          <Switch
            checked={files.singleClickOpen}
            onChange={(e) => patch({ singleClickOpen: e.target.checked })}
          />
        </Row>
        <Row
          id="files.home"
          label={t('filesPage.homeFolder')}
          description={t('filesPage.homeFolderHint')}
        >
          <Value>{home}</Value>
          <Button
            size="sm"
            icon={<FolderOpen className="size-3.5" />}
            onClick={() => void chooseHome()}
          >
            {t('filesPage.choose')}
          </Button>
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}
