import { RELEASES_URL, REPO_URL } from '../lib/links';
import { Section } from './Section';

export function Download() {
  return (
    <Section id="download" title="Download">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-10">
        <div className="max-w-[52ch]">
          <h3 className="text-lg font-medium">Windows</h3>
          <div className="prose mt-2 text-ink-2">
            <p>
              The desktop build is a Tauri 2 application. Each release on GitHub carries an NSIS
              installer (.exe) and an MSI package; either one installs the same binary.
            </p>
            <p>
              It needs Windows 10 or 11 with the WebView2 runtime, which Windows 11 ships with. The
              home directory defaults to{' '}
              <span className="mono text-sm">%LOCALAPPDATA%\LumenOS\home</span> and can be moved
              from Settings → Storage.
            </p>
          </div>
          <a href={RELEASES_URL} className="btn btn-primary mt-6" rel="noreferrer">
            Download for Windows
          </a>
        </div>
        <div>
          <h3 className="text-lg font-medium">Run from source</h3>
          <p className="mt-2 max-w-[52ch] text-ink-2">
            Node 22 and pnpm 10 for the web build; add a stable Rust toolchain and the Tauri
            prerequisites for the desktop window.
          </p>
          <pre className="code-block mono mt-4">
            <code>
              {'git clone '}
              {REPO_URL}
              {'\ncd os\npnpm install     '}
              <span className="comment"># deps and git hooks</span>
              {'\npnpm dev:web     '}
              <span className="comment"># OS at http://localhost:5173</span>
              {'\npnpm dev:desktop '}
              <span className="comment"># Tauri window</span>
            </code>
          </pre>
        </div>
      </div>
    </Section>
  );
}
