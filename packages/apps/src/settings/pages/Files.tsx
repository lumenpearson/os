import type { FilesView } from '@lumen/kernel';
import { useKernel, useSetting } from '@lumen/kernel/react';
import { Button, Select, type SelectOption, SettingsGroup, SettingsPage, Switch } from '@lumen/ui';
import { FolderOpen } from 'lucide-react';
import { useFilePicker } from '../../_sdk';
import { Row, Value } from '../Row';

const VIEWS: SelectOption<FilesView>[] = [
  { value: 'list', label: 'List' },
  { value: 'grid', label: 'Grid' },
  { value: 'columns', label: 'Columns' },
  { value: 'cards', label: 'Cards' },
];

export function FilesPage() {
  const kernel = useKernel();
  const [files, patch] = useSetting('files');
  const pick = useFilePicker();
  const home = files.home || kernel.home;

  const chooseHome = async () => {
    const result = await pick({ mode: 'folder', title: 'Choose the home folder', startDir: home });
    const path = Array.isArray(result) ? result[0] : result;
    if (path) patch({ home: path });
  };

  return (
    <SettingsPage title="Files" description="How the Files app lists and opens things.">
      <SettingsGroup title="Listing">
        <Row id="files.hidden" label="Show hidden files" description="Names that start with a dot.">
          <Switch
            checked={files.showHidden}
            onChange={(e) => patch({ showHidden: e.target.checked })}
          />
        </Row>
        <Row id="files.extensions" label="Show file extensions">
          <Switch
            checked={files.showExtensions}
            onChange={(e) => patch({ showExtensions: e.target.checked })}
          />
        </Row>
        <Row
          id="files.foldersFirst"
          label="Folders first"
          description="Otherwise folders and files sort together."
        >
          <Switch
            checked={files.foldersFirst}
            onChange={(e) => patch({ foldersFirst: e.target.checked })}
          />
        </Row>
        <Row id="files.view" label="Default view">
          <Select
            options={VIEWS}
            value={files.defaultView}
            onChange={(defaultView) => patch({ defaultView })}
          />
        </Row>
      </SettingsGroup>
      <SettingsGroup title="Behaviour">
        <Row id="files.confirmDelete" label="Confirm before moving to Trash">
          <Switch
            checked={files.confirmDelete}
            onChange={(e) => patch({ confirmDelete: e.target.checked })}
          />
        </Row>
        <Row
          id="files.singleClick"
          label="Open with a single click"
          description="Otherwise double-click opens and single-click selects."
        >
          <Switch
            checked={files.singleClickOpen}
            onChange={(e) => patch({ singleClickOpen: e.target.checked })}
          />
        </Row>
        <Row id="files.home" label="Home folder" description="Where new Files windows open.">
          <Value>{home}</Value>
          <Button
            size="sm"
            icon={<FolderOpen className="size-3.5" />}
            onClick={() => void chooseHome()}
          >
            Choose…
          </Button>
        </Row>
      </SettingsGroup>
    </SettingsPage>
  );
}
