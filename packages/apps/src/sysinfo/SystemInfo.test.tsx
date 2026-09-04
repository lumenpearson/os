import { createKernel, type Kernel, useClipboardStore, useMenuStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { join, MemoryAdapter } from '@lumen/vfs';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProvider } from '../_sdk';
import definition from './index';
import { Overview } from './Overview';
import { known, REASONS, unknown } from './probe';
import { Row } from './Row';
import { Section } from './Section';
import { StorageBar } from './StorageBar';
import SystemInfo from './SystemInfo';
import type { FactRow, Section as SectionModel, StorageReading } from './sections';

function row(id: string, label: string, fact: FactRow['fact'], note?: string): FactRow {
  return note ? { id, label, fact, note } : { id, label, fact };
}

describe('Row', () => {
  afterEach(cleanup);

  it('prints the label, the value and where it came from', () => {
    render(<Row row={row('a', 'Logical cores', known('16'), 'Reported by sysinfo.')} />);
    expect(screen.getByText('Logical cores')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('Reported by sysinfo.')).toBeInTheDocument();
  });

  it('prints an em-dash and the reason when the platform cannot report it', () => {
    const { container } = render(<Row row={row('b', 'Device name', unknown(REASONS.hostname))} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText(REASONS.hostname)).toBeInTheDocument();
    expect(container.querySelector('[data-row="b"]')).toHaveAttribute('data-available', 'false');
  });

  it('never shows a note on a row it could not fill in', () => {
    render(<Row row={{ ...row('c', 'Model', unknown('no reading')), note: 'from sysinfo' }} />);
    expect(screen.queryByText('from sysinfo')).not.toBeInTheDocument();
    expect(screen.getByText('no reading')).toBeInTheDocument();
  });
});

describe('Section', () => {
  afterEach(cleanup);

  const section: SectionModel = {
    id: 'memory',
    title: 'Memory',
    rows: [
      row('memory.total', 'Physical memory', unknown(REASONS.installedMemory)),
      row('memory.device', 'Device memory', known('8 GB')),
    ],
  };

  it('titles the card and lists every row', () => {
    render(<Section section={section} />);
    expect(screen.getByRole('heading', { name: 'Memory' })).toBeInTheDocument();
    expect(screen.getByText('Physical memory')).toBeInTheDocument();
    expect(screen.getByText('8 GB')).toBeInTheDocument();
  });

  it('puts a header above the rows', () => {
    render(<Section section={section} header={<p>bar</p>} />);
    expect(screen.getByText('bar')).toBeInTheDocument();
  });
});

describe('StorageBar', () => {
  afterEach(cleanup);

  const reading: StorageReading = { source: 'storage-api', used: 1024 ** 3, quota: 4 * 1024 ** 3 };

  it('draws usage against the quota', () => {
    render(<StorageBar reading={reading} />);
    expect(screen.getByRole('progressbar', { name: 'Storage in use' })).toHaveAttribute(
      'aria-valuenow',
      '25',
    );
    expect(screen.getByText('1.0 GB of 4.0 GB used (25%)')).toBeInTheDocument();
  });

  it('draws no bar without a quota, and says why', () => {
    render(<StorageBar reading={{ ...reading, quota: null }} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText(REASONS.quota)).toBeInTheDocument();
  });
});

describe('Overview', () => {
  afterEach(cleanup);

  it('leads with the mark, the name and the version', () => {
    render(
      <Overview
        section={{
          id: 'overview',
          title: 'Overview',
          rows: [
            row('overview.version', 'Version', known('0.4.2')),
            row('overview.build', 'Build target', known('Web browser')),
          ],
        }}
      />,
    );
    expect(screen.getByRole('img', { name: 'Lumen OS' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lumen OS' })).toBeInTheDocument();
    expect(screen.getByText('0.4.2 · Web browser')).toBeInTheDocument();
  });
});

describe('the window', () => {
  let kernel: Kernel;
  let windowId: string;

  beforeEach(async () => {
    const platform = createWebPlatform();
    kernel = createKernel({
      platform: { ...platform, adapter: new MemoryAdapter() },
      apps: [{ ...definition, component: () => null }],
      autoSetup: { name: 'Ada Lovelace' },
    });
    await kernel.boot();
    const process = kernel.launch('lumen.sysinfo');
    if (!process) throw new Error('failed to launch');
    windowId = process.windowIds[0] as string;
    render(
      <KernelProvider kernel={kernel}>
        <AppProvider
          value={{ pid: process.pid, windowId, appId: 'lumen.sysinfo', container: null }}
        >
          <SystemInfo pid={process.pid} windowId={windowId} args={{}} />
        </AppProvider>
      </KernelProvider>,
    );
    await screen.findByRole('heading', { name: 'Lumen OS' }, { timeout: 5000 });
  });

  afterEach(cleanup);

  it('shows every section of the sheet', () => {
    for (const title of [
      'Processor',
      'Memory',
      'Graphics',
      'Storage',
      'Software',
      'Feature support',
      'Uptime',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
  });

  it('says why a browser cannot report the processor model', () => {
    expect(screen.getByText(REASONS.cpuModel)).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('counts the readings it could not take', () => {
    expect(screen.getByText(/unavailable here$/)).toBeInTheDocument();
  });

  it('contributes File, Edit and View', () => {
    expect(useMenuStore.getState().byWindow[windowId]?.map((m) => m.label)).toEqual([
      'File',
      'Edit',
      'View',
    ]);
  });

  it('copies the whole sheet, reasons included', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Copy Report' }));
    const item = useClipboardStore.getState().item;
    expect(item?.kind).toBe('text');
    expect(item?.text).toContain('System Information');
    expect(item?.text).toContain(REASONS.cpuModel);
  });

  it('saves the report into Documents', async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Save Report' }));
    const documents = join(kernel.home, 'Documents');
    await waitFor(async () => {
      const entries = await kernel.vfs.readDir(documents);
      expect(entries.map((e) => e.name)).toContainEqual(
        expect.stringMatching(/^System Report .*\.txt$/),
      );
    });
  });
});
