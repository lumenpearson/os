import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Receipt } from './account';
import { PurchasesSection, receiptsSummary } from './PurchasesSection';

const DAY = 86_400_000;

function receipt(over: Partial<Receipt> = {}): Receipt {
  return {
    id: 'r1',
    kind: 'subscription',
    item: 'monthly',
    description: 'Monthly plan',
    amountMinor: 500,
    currency: 'GBP',
    when: DAY * 20_000,
    ...over,
  };
}

/*
 * Money is printed in the region Lumen is set to. These assertions name a
 * locale rather than leaning on the machine's, which is why they used to fail
 * on a Russian Windows and pass in CI — the one difference that makes a test
 * useless exactly where it would have helped.
 */
const EN = 'en-GB';

describe('receiptsSummary', () => {
  it('says so plainly when there is nothing to add up', () => {
    expect(receiptsSummary([])).toBe('No receipts');
  });

  it('counts one receipt in the singular', () => {
    expect(receiptsSummary([receipt()], EN)).toBe('1 receipt, £5.00 in total');
  });

  it('adds up receipts in the same currency', () => {
    expect(receiptsSummary([receipt(), receipt({ id: 'r2', amountMinor: 4800 })], EN)).toBe(
      '2 receipts, £53.00 in total',
    );
  });

  it('counts a package line, which is charged at nothing', () => {
    // A package costs a plan rather than money, so it belongs in the count
    // and adds nothing to the total.
    const free = receipt({ id: 'r2', kind: 'package', item: 'lumen.notes', amountMinor: 0 });
    expect(receiptsSummary([receipt(), free], EN)).toBe('2 receipts, £5.00 in total');
  });
});

describe('PurchasesSection', () => {
  it('says what would be here rather than showing an empty table', () => {
    render(<PurchasesSection receipts={[]} />);
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    // It says what would put a line here, rather than apologising for the gap.
    expect(screen.getByText('No receipts yet')).toBeInTheDocument();
    expect(screen.getByText(/writes a line here/)).toBeInTheDocument();
  });

  it('prints a subscription line as words and a package line by its id', () => {
    render(
      <PurchasesSection
        receipts={[
          receipt(),
          receipt({
            id: 'r2',
            kind: 'package',
            item: 'lumen.notes',
            description: 'Included with Monthly',
            amountMinor: 0,
          }),
        ]}
      />,
    );
    expect(screen.getByText('Monthly plan')).toBeInTheDocument();
    expect(screen.getByText('lumen.notes')).toBeInTheDocument();
    expect(screen.getByText('£5.00')).toBeInTheDocument();
    expect(screen.getByText('£0.00')).toBeInTheDocument();
  });
});
