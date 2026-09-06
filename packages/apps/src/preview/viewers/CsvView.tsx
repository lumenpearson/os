import { EmptyState } from '@lumen/ui';
import { Table } from 'lucide-react';
import { useMemo } from 'react';
import { CSV_ROW_LIMIT, toCsvTable } from '../document';

export interface CsvViewProps {
  text: string;
  /** The file name: the accessible name of the table. */
  name: string;
}

/** A column with no header still needs one; the letter says which column it is. */
function columnName(header: string, index: number): string {
  return header.trim() === '' ? `Column ${index + 1}` : header;
}

/** Delimited data as a read-only table, first row as the headers. */
export function CsvView({ text, name }: CsvViewProps) {
  const table = useMemo(() => toCsvTable(text), [text]);

  if (table.columns === 0) {
    return <EmptyState icon={<Table />} title="Nothing to show" description="The file is empty." />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="lumen-scroll min-h-0 flex-1">
        <table className="mono w-max min-w-full border-collapse text-sm">
          <caption className="sr-only">{name}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 left-0 z-20 border-r border-b border-rule bg-canvas px-2 py-1 text-right font-medium text-ink-3"
              >
                #
              </th>
              {table.header.map((cell, column) => (
                <th
                  key={column}
                  scope="col"
                  className="sticky top-0 z-10 border-b border-rule bg-canvas px-2 py-1 text-left font-medium whitespace-nowrap text-ink"
                >
                  {columnName(cell, column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, index) => (
              <tr key={index} className="even:bg-stripe">
                <th
                  scope="row"
                  className="sticky left-0 border-r border-rule bg-inherit px-2 py-1 text-right font-normal tabular-nums text-ink-3"
                >
                  {index + 1}
                </th>
                {row.map((cell, column) => (
                  <td
                    key={column}
                    className="max-w-80 truncate-1 border-b border-rule px-2 py-1 tabular-nums text-ink-2"
                    title={cell}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mono flex shrink-0 items-center gap-3 border-t border-rule bg-canvas px-4 py-1.5 text-xs text-ink-3">
        <span className="tabular-nums">
          {table.totalRows.toLocaleString()} rows × {table.columns} columns
        </span>
        {table.truncated && (
          <span className="tabular-nums">first {CSV_ROW_LIMIT.toLocaleString()} shown</span>
        )}
      </p>
    </div>
  );
}
