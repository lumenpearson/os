import type { ReactNode } from 'react';

interface SectionProps {
  id: string;
  title: string;
  children: ReactNode;
}

/** A page section: hairline on top, heading in the left column, content on the right. */
export function Section({ id, title, children }: SectionProps) {
  const headingId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={headingId} className="border-t border-rule">
      <div className="container grid gap-8 py-16 md:grid-cols-[200px_minmax(0,1fr)] md:gap-16 md:py-28 lg:grid-cols-[240px_minmax(0,1fr)]">
        <h2 id={headingId} className="text-xl font-semibold md:sticky md:top-20 md:self-start">
          {title}
        </h2>
        <div>{children}</div>
      </div>
    </section>
  );
}
