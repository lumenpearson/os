import { OS_URL, REPO_URL } from '../lib/links';
import type { Theme } from '../lib/theme';

const links = [
  { href: '#overview', label: 'Overview' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#apps', label: 'Apps' },
  { href: '#download', label: 'Download' },
];

interface NavProps {
  theme: Theme;
  onToggleTheme: () => void;
}

export function Nav({ theme, onToggleTheme }: NavProps) {
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <header className="sticky top-0 z-10 border-b border-rule bg-canvas">
      <nav
        aria-label="Site"
        className="container flex flex-wrap items-center gap-x-6 gap-y-2 py-2.5"
      >
        <a
          href="#top"
          className="flex items-baseline gap-2 no-underline"
          aria-label="Lumen OS, top of page"
        >
          <span className="text-md font-semibold">Lumen OS</span>
          <span className="mono text-sm text-ink-3">v{__APP_VERSION__}</span>
        </a>
        <ul className="order-last flex w-full gap-5 text-base md:order-none md:w-auto md:flex-1">
          {links.map((link) => (
            <li key={link.href}>
              <a href={link.href} className="nav-link">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-1.5">
          <a href={REPO_URL} className="btn btn-sm btn-quiet" rel="noreferrer">
            GitHub
          </a>
          <button
            type="button"
            className="btn btn-sm btn-quiet mono"
            onClick={onToggleTheme}
            aria-label={`Switch to the ${next} theme`}
          >
            {next === 'dark' ? 'Dark' : 'Light'}
          </button>
          <a href={OS_URL} className="btn btn-sm btn-primary" rel="noreferrer">
            Open in browser
          </a>
        </div>
      </nav>
    </header>
  );
}
