/**
 * Purchases: every receipt the account holds, newest first.
 *
 * Two kinds of line end up here and they are not the same thing. A
 * subscription line is the charge — a plan, for one period, at its price. A
 * package line is what that plan let through: `recordPurchase` writes it at
 * zero, because a package costs a plan rather than money. So the middle column
 * reads differently for each: a plan's line says itself in words, a package's
 * leads with the id that was installed.
 */

import { type Column, DataTable, EmptyState } from '@lumen/ui';
import { Receipt as ReceiptIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CurrencyCode, Receipt } from './account';
// Money and dates are printed the way the plans print them; see the notes
// there on minor units and on reading a day in UTC.
import { formatDay, formatMoney } from './SubscriptionSection';

/**
 * What the table adds up to. Totals are kept per currency: a receipt carries
 * the currency it was charged in, and adding unlike ones together would print
 * a number that is true of nothing.
 */
export function receiptsSummary(receipts: readonly Receipt[]): string {
  if (receipts.length === 0) return 'No receipts';
  const totals = new Map<CurrencyCode, number>();
  for (const receipt of receipts) {
    totals.set(receipt.currency, (totals.get(receipt.currency) ?? 0) + receipt.amountMinor);
  }
  const count = receipts.length === 1 ? '1 receipt' : `${receipts.length} receipts`;
  const money = [...totals].map(([currency, minor]) => formatMoney(minor, currency)).join(' and ');
  return `${count}, ${money} in total`;
}

const COLUMNS: Column<Receipt>[] = [
  {
    id: 'when',
    header: 'Date',
    width: '150px',
    mono: true,
    sortable: true,
    accessor: (receipt) => receipt.when,
    render: (receipt) => formatDay(receipt.when),
  },
  {
    id: 'for',
    header: 'For',
    width: 'minmax(180px,1fr)',
    sortable: true,
    accessor: (receipt) =>
      receipt.kind === 'subscription'
        ? receipt.description
        : `${receipt.item} ${receipt.description}`,
    render: (receipt) =>
      receipt.kind === 'subscription' ? (
        receipt.description
      ) : (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="mono truncate-1 text-ink">{receipt.item}</span>
          <span className="truncate-1 text-ink-2">{receipt.description}</span>
        </span>
      ),
  },
  {
    id: 'amount',
    header: 'Amount',
    width: '100px',
    align: 'right',
    mono: true,
    sortable: true,
    accessor: (receipt) => receipt.amountMinor,
    render: (receipt) => formatMoney(receipt.amountMinor, receipt.currency),
  },
];

export interface PurchasesSectionProps {
  receipts: readonly Receipt[];
}

export function PurchasesSection({ receipts }: PurchasesSectionProps) {
  const [sort, setSort] = useState<{ column: string; direction: 'asc' | 'desc' } | null>({
    column: 'when',
    direction: 'desc',
  });
  const rows = useMemo(() => [...receipts], [receipts]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<ReceiptIcon />}
        title="No receipts yet"
        description="Taking out a plan, or installing a package it covers, writes a line here."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-rule bg-canvas px-4 py-1.5">
        <p className="mono text-sm text-ink-2 tabular-nums">{receiptsSummary(rows)}</p>
      </div>
      <DataTable
        className="flex-1"
        columns={COLUMNS}
        rows={rows}
        rowKey={(receipt) => receipt.id}
        sort={sort}
        onSortChange={setSort}
      />
    </div>
  );
}
