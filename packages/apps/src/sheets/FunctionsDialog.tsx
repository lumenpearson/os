import { Dialog, Input } from '@lumen/ui';
import { useMemo, useState } from 'react';
import { FUNCTION_DOCS, type FunctionCategory } from './engine/functions';

const CATEGORY_ORDER: FunctionCategory[] = [
  'Math',
  'Statistics',
  'Logic',
  'Text',
  'Date',
  'Lookup',
  'Info',
];

/** Help → Functions: every function the engine knows, with its signature. */
export function FunctionsDialog({
  open,
  onClose,
  container,
}: {
  open: boolean;
  onClose: () => void;
  container: HTMLElement | null;
}) {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = FUNCTION_DOCS.filter(
      (d) =>
        q === '' || d.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q),
    );
    return CATEGORY_ORDER.map((category) => ({
      category,
      items: matches.filter((d) => d.category === category),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Functions"
      width={620}
      container={container}
      className="h-[560px]"
    >
      <div className="flex flex-col gap-3">
        <Input
          data-autofocus
          type="search"
          value={query}
          placeholder="Search functions"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search functions"
        />
        {groups.length === 0 && (
          <p className="py-6 text-center text-ink-3">No function matches “{query}”.</p>
        )}
        {groups.map((group) => (
          <section key={group.category} className="flex flex-col gap-1.5">
            <h3 className="mono text-xs uppercase tracking-[0.08em] text-ink-3">
              {group.category}
            </h3>
            <dl className="flex flex-col divide-y divide-rule rounded-md border border-rule">
              {group.items.map((item) => (
                <div key={item.name} className="flex flex-col gap-0.5 px-3 py-2">
                  <dt className="mono text-sm text-ink">{item.signature}</dt>
                  <dd className="text-sm text-ink-2">{item.description}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
