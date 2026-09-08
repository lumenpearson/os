// deslop-ignore-file 34 — these programs print values (numbers, hex codes,
// durations, byte counts), and design rule 1 sets values in the monospace
// face. A sandboxed frame cannot reach the OS stylesheet, so every program
// carries the rule itself.

/**
 * The stylesheet and bridge glue every store program starts from.
 *
 * This is a deliberate copy of `packages/apps/src/software/programs/shared.ts`
 * rather than an import: the store directory is meant to be lifted into its
 * own repository, where nothing from `@lumen/*` exists. The two files describe
 * the same surface — neutral ramp, one accent, one radius scale — because a
 * downloaded program should be indistinguishable from a bundled one.
 */
export const PROGRAM_STYLE = `<style>
:root {
  color-scheme: light;
  --bg: #ffffff;
  --surface: #f5f6f7;
  --ink: #1f2126;
  --ink-2: #5c6069;
  --ink-3: #8a8e97;
  --rule: #e2e3e7;
  --accent: #3478f6;
  --radius: 5px;
}
html[data-theme="dark"] {
  color-scheme: dark;
  --bg: #1c1e22;
  --surface: #24262b;
  --ink: #eceef1;
  --ink-2: #a1a5ad;
  --ink-3: #7d818a;
  --rule: #33363c;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 14px;
  background: var(--bg);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.45;
}
h1 { font-size: 15px; font-weight: 600; margin: 0 0 2px; letter-spacing: -0.005em; }
h2 { font-size: 12px; font-weight: 600; margin: 14px 0 6px; color: var(--ink-2); }
p.lede { margin: 0 0 14px; color: var(--ink-2); font-size: 12px; }
label { display: block; font-size: 12px; color: var(--ink-2); margin: 0 0 4px; }
input, select, textarea, button {
  font: inherit;
  color: var(--ink);
  background: var(--bg);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  padding: 4px 7px;
}
input, select, textarea { width: 100%; }
textarea { resize: vertical; line-height: 1.5; }
button {
  background: var(--surface);
  padding: 4px 10px;
  width: auto;
  cursor: pointer;
  transition: background-color 150ms ease, border-color 150ms ease;
}
button:hover { border-color: var(--ink-3); }
button[aria-pressed="true"] { border-color: var(--accent); color: var(--accent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.mono {
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-variant-numeric: tabular-nums;
}
.row { display: flex; gap: 8px; align-items: flex-end; }
.row > * { min-width: 0; }
.actions { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.panel {
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  background: var(--surface);
  padding: 10px;
}
.muted { color: var(--ink-2); }
.note { font-size: 12px; color: var(--ink-3); margin-top: 8px; }
.alert { font-size: 12px; color: var(--ink); border-left: 2px solid var(--accent); padding-left: 8px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { text-align: left; padding: 3px 6px; border-bottom: 1px solid var(--rule); }
th { color: var(--ink-2); font-weight: 500; position: sticky; top: 0; background: var(--bg); }
</style>`;

/** Follows the OS accent. The frame prelude sends the theme as soon as it loads. */
export const THEME_SCRIPT = `<script>
addEventListener('lumen:theme', function (e) {
  var accent = e.detail && e.detail.accent;
  if (accent) document.documentElement.style.setProperty('--accent', accent);
});
</script>`;

/** Assemble a program document: shared style, its own style, its markup, its script. */
export function program(body, script, style = '') {
  return `${PROGRAM_STYLE}${style}${body}${THEME_SCRIPT}${script}`;
}

/**
 * Wrap an `AppManifest` in the catalogue fields a store package needs.
 *
 * Every app package in this store is one manifest plus its shopfront copy, so
 * the individual modules stay about the program and not about bookkeeping.
 */
export function appPackage(entry) {
  return {
    id: entry.id,
    kind: 'app',
    name: entry.manifest.name,
    tagline: entry.tagline,
    version: entry.version,
    publisher: entry.publisher ?? 'Lumen',
    category: entry.manifest.category ?? 'utilities',
    price: entry.price ?? 'free',
    keywords: entry.manifest.keywords ?? [],
    updated: entry.updated,
    description: entry.description,
    capabilities: entry.capabilities ?? [],
    requires: entry.requires ?? { os: '>=0.1.0' },
    screenshots: entry.screenshots ?? [],
    releaseNotes: entry.releaseNotes,
    payload: entry.manifest,
  };
}
