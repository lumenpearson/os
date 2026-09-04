import { REPO_URL, repoFile } from '../lib/links';

const links = [
  { href: repoFile('LICENSE'), label: 'MIT licence' },
  { href: repoFile('CODE_OF_CONDUCT.md'), label: 'Code of conduct' },
  { href: repoFile('AI_USAGE_POLICY.md'), label: 'AI usage policy' },
  { href: repoFile('SECURITY.md'), label: 'Security' },
  { href: REPO_URL, label: 'Source' },
];

export function Footer() {
  return (
    <footer className="border-t border-rule">
      <div className="container flex flex-col gap-3 py-8 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between">
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
          {links.map((link) => (
            <li key={link.href}>
              <a href={link.href} className="link" rel="noreferrer">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
        <p>Built with React 19, Tauri 2, Vite, three.js.</p>
      </div>
    </footer>
  );
}
