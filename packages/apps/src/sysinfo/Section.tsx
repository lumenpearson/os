import type { ReactNode } from 'react';
import { Row } from './Row';
import type { Section as SectionModel } from './sections';

export interface SectionProps {
  section: SectionModel;
  /** Rendered above the rows, inside the same card (the storage bar). */
  header?: ReactNode;
}

/** A titled card holding one definition list of readings. */
export function Section({ section, header }: SectionProps) {
  const headingId = `sysinfo-${section.id}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="px-1 text-md font-medium text-ink">
        {section.title}
      </h2>
      <div className="rounded-md border border-rule bg-surface">
        {header && <div className="border-b border-rule px-4 py-3">{header}</div>}
        <dl className="divide-y divide-rule">
          {section.rows.map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </dl>
      </div>
    </section>
  );
}
