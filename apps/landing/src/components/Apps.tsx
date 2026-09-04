import { apps } from '../content/apps';
import { Section } from './Section';

export function Apps() {
  return (
    <Section id="apps" title="Apps">
      <p className="max-w-[64ch] text-ink-2">
        Everything below ships with the OS. Each app opens in its own window, and the ones that
        handle files declare which extensions they open.
      </p>
      <ul className="mt-8 grid border-t border-rule sm:grid-cols-2 sm:gap-x-10">
        {apps.map((app) => (
          <li key={app.name} className="grid gap-0.5 border-b border-rule py-3">
            <span className="font-medium">{app.name}</span>
            <span className="text-sm text-ink-2">{app.summary}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
