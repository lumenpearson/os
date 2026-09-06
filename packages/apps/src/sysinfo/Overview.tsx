import { Row } from './Row';
import type { Section } from './sections';
import { heroSubline } from './view';

/** The Lumen mark: an "L" in one stroke inside a hairline square. */
function LumenMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className="shrink-0 text-ink"
      role="img"
      aria-label="Lumen OS"
    >
      <rect
        x="0.5"
        y="0.5"
        width="63"
        height="63"
        rx="13.5"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
      />
      <path
        d="M22 17v30h21"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * What this is and what it is running on: the mark, the name, the version and
 * build target under it, then the host system and the machine's own name —
 * which only the desktop build can ask for.
 */
export function Overview({ section }: { section: Section }) {
  return (
    <section aria-label={section.title} className="rounded-md border border-rule bg-surface">
      <div className="flex items-center gap-4 border-b border-rule px-4 py-4">
        <LumenMark size={44} />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Lumen OS</h1>
          <p className="mono text-sm tabular-nums text-ink-2">{heroSubline(section)}</p>
        </div>
      </div>
      <dl className="divide-y divide-rule">
        {section.rows.map((row) => (
          <Row key={row.id} row={row} />
        ))}
      </dl>
    </section>
  );
}
