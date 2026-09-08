import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type Column, DataTable } from './DataTable';

interface Row {
  id: string;
  name: string;
  size: number;
}

const columns: Column<Row>[] = [
  { id: 'name', header: 'Name', accessor: (r) => r.name },
  { id: 'size', header: 'Size', accessor: (r) => r.size, align: 'right' },
  { id: 'kind', header: 'Kind', accessor: () => 'File' },
];

const rows: Row[] = [
  { id: 'a', name: 'alpha', size: 1 },
  { id: 'b', name: 'bravo', size: 2 },
  { id: 'c', name: 'charlie', size: 3 },
];

/** The header row and the body rows, in document order. */
function grid() {
  const all = screen.getAllByRole('row');
  const [header, ...body] = all;
  if (!header) throw new Error('the table drew no header');
  return { header, body };
}

/**
 * The lane rule is a container variant — `[&>*+*]:border-l` — so it lives on
 * the row, not on the cells. Pull it back out so the header's and the body's
 * can be compared for being the same string.
 */
function lanes(row: Element) {
  return row.className
    .split(/\s+/)
    .filter((c) => c.startsWith('[&>*+*]:'))
    .sort()
    .join(' ');
}

describe('DataTable', () => {
  it('draws one lane rule per boundary, on the same side in the header and the rows', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const { header, body } = grid();

    // The header and the rows carry the same lane string, so each boundary
    // gets one hairline. When the header also put a `border-r` on every
    // column button, each boundary was painted twice — two pixels, at nearly
    // three times the weight, sitting one pixel left of the rows' own.
    expect(lanes(header)).toBe('[&>*+*]:border-l [&>*+*]:border-rule/40');
    for (const child of header.children) expect(child.className).not.toContain('border-r');

    expect(body).toHaveLength(rows.length);
    for (const row of body) expect(lanes(row)).toBe(lanes(header));
  });

  it('washes every other row, and leaves a selected row its accent', () => {
    const { rerender } = render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    expect(grid().body[1]?.className).toContain('bg-stripe');
    expect(grid().body[0]?.className).not.toContain('bg-stripe');

    rerender(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        selected={new Set(['b'])}
        onSelect={() => {}}
      />,
    );
    // `bg-stripe` is a utility and would out-layer the selection that
    // `.lumen-list-row[aria-selected]` paints, so the selected row opts out.
    const selected = grid().body[1];
    expect(selected?.getAttribute('aria-selected')).toBe('true');
    expect(selected?.className).not.toContain('bg-stripe');
  });
});
