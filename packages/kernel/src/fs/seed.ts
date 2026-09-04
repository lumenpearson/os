import { join, type Vfs } from '@lumen/vfs';
import type { AppManifest } from '../types';
import {
  APPLICATIONS_DIR,
  HOME_SUBDIRS,
  homeDir,
  SYSTEM_DIR,
  TRASH_DIR,
  USERS_DIR,
  WALLPAPERS_DIR,
} from './layout';

/** Create the system directories. Idempotent. */
export async function seedSystem(vfs: Vfs): Promise<void> {
  for (const dir of [SYSTEM_DIR, APPLICATIONS_DIR, USERS_DIR, TRASH_DIR, WALLPAPERS_DIR]) {
    await vfs.ensureDir(dir);
  }
}

/** Create a user's home directory with starter content. Idempotent for the folders. */
export async function seedHome(vfs: Vfs, username: string, displayName: string): Promise<void> {
  const home = homeDir(username);
  await vfs.ensureDir(home);
  for (const sub of HOME_SUBDIRS) await vfs.ensureDir(join(home, sub));

  const marker = join(home, '.seeded');
  if (await vfs.exists(marker)) return;

  const docs = join(home, 'Documents');
  const desktop = join(home, 'Desktop');
  const projects = join(home, 'Projects');

  await vfs.writeText(join(desktop, 'Welcome.md'), welcomeMarkdown(displayName));
  await vfs.writeText(join(docs, 'Getting started.txt'), gettingStarted());
  await vfs.writeJson(join(docs, 'Budget.lsd'), sampleSheet());
  await vfs.writeJson(join(docs, 'Roadmap.lsl'), sampleSlides());
  await vfs.writeText(join(docs, 'Notes.md'), '# Notes\n\nA place to think.\n');
  await vfs.writeText(join(projects, 'hello.lsh'), sampleScript());
  await vfs.writeText(join(projects, 'clock.app'), JSON.stringify(sampleHtmlApp(), null, 2));
  await vfs.writeText(
    join(home, 'Pictures', 'README.txt'),
    'Drop images here. Files opens them in Preview.\n',
  );
  await vfs.writeText(marker, String(Date.now()));
}

/** Manifests placed in /Applications so the file system mirrors the launcher. */
export async function seedApplications(
  vfs: Vfs,
  apps: Array<{ id: string; name: string; description: string }>,
) {
  await vfs.ensureDir(APPLICATIONS_DIR);
  const existing = new Set((await vfs.readDir(APPLICATIONS_DIR)).map((e) => e.name));
  for (const app of apps) {
    const file = `${app.name}.app`;
    if (existing.has(file)) continue;
    const manifest: AppManifest = {
      id: app.id,
      name: app.name,
      description: app.description,
      alias: { appId: app.id },
    };
    await vfs.writeText(join(APPLICATIONS_DIR, file), JSON.stringify(manifest, null, 2));
  }
}

function welcomeMarkdown(name: string): string {
  return `# Welcome, ${name}

This is your desktop. A few things worth knowing:

- **Files** opens with the folder icon in the taskbar or \`Ctrl+Alt+E\`.
- **Search** anything with \`Ctrl+Space\`: apps, files, settings, a calculation.
- Drag a window to a screen edge to snap it. Drag it to the top to maximize.
- The **Start** button on the left of the taskbar lists every app.
- **Settings → Appearance** changes theme, accent and wallpaper.

Your files live in \`/Users/${name.toLowerCase()}\`. Everything is stored locally.
`;
}

function gettingStarted(): string {
  return [
    'Getting started with Lumen OS',
    '',
    '1. Open Files and look around Documents.',
    '2. Double-click Budget.lsd to open Sheets, or Roadmap.lsl for Slides.',
    '3. Open Terminal and type `help`.',
    '4. Projects/clock.app is a pseudo-program: double-click it to run it.',
    '5. Projects/hello.lsh is a script. In Terminal: `run ~/Projects/hello.lsh`.',
    '',
    'Lock the screen with Ctrl+Alt+L. If you forget your password, use the recovery key from setup.',
    '',
  ].join('\n');
}

function sampleSheet() {
  return {
    version: 1,
    sheets: [
      {
        name: 'Budget',
        cells: {
          A1: 'Item',
          B1: 'Planned',
          C1: 'Actual',
          A2: 'Rent',
          B2: 1200,
          C2: 1200,
          A3: 'Groceries',
          B3: 420,
          C3: 388,
          A4: 'Transport',
          B4: 90,
          C4: 104,
          A5: 'Total',
          B5: '=SUM(B2:B4)',
          C5: '=SUM(C2:C4)',
          A7: 'Difference',
          B7: '=B5-C5',
        },
        columnWidths: { A: 140 },
      },
    ],
  };
}

function sampleSlides() {
  return {
    version: 1,
    title: 'Roadmap',
    slides: [
      { id: 's1', layout: 'title', title: 'Roadmap', subtitle: 'What ships next' },
      {
        id: 's2',
        layout: 'bullets',
        title: 'This quarter',
        bullets: ['Files: column view', 'Terminal: pipes', 'Settings: keyboard remapping'],
      },
      {
        id: 's3',
        layout: 'bullets',
        title: 'Later',
        bullets: ['Multi-user', 'Widgets', 'Extensions'],
      },
    ],
  };
}

function sampleScript(): string {
  return `# Lumen shell script — run with: run hello.lsh
echo Hello from a script.
echo Today is $(date)
ls ~/Documents
`;
}

function sampleHtmlApp(): AppManifest {
  return {
    id: 'user.clock',
    name: 'Big Clock',
    description: 'A full-window clock. Example of an HTML pseudo-program.',
    category: 'user',
    window: { width: 420, height: 260 },
    html: `<!doctype html><meta charset="utf-8"><style>
html,body{height:100%;margin:0;display:grid;place-items:center;background:#141517;color:#ececee;font:600 72px/1 "JetBrains Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
small{display:block;font-size:14px;font-weight:400;letter-spacing:.08em;text-align:center;margin-top:12px;color:#8b8f98}
</style><div><span id="t"></span><small id="d"></small></div><script>
function tick(){const n=new Date();document.getElementById('t').textContent=n.toTimeString().slice(0,8);document.getElementById('d').textContent=n.toDateString()}tick();setInterval(tick,1000)
</script>`,
  };
}
