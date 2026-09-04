# @lumen/apps

Built-in applications, one folder per app, plus the SDK they are written
against (`src/_sdk`). The shell mounts an app through `AppHost`; apps never
import the shell.

## Anatomy of an app

```
src/<app-id>/
  index.tsx        default export: AppDefinition (icon, window, associations, lazy component)
  <App>.tsx        the React component (props: { pid, windowId, args })
  logic.ts         pure logic (parsers, evaluators, reducers)
  logic.test.ts    Vitest tests for the logic
```

`index.tsx` must be cheap to import (no heavy work at module scope) because
every app's definition loads at boot; the component is `lazy()`.

```tsx
import { FileText } from 'lucide-react';
import { lazy } from 'react';
import { createAppIcon, defineApp } from '../_sdk';

export default defineApp({
  id: 'lumen.editor',
  name: 'Text Editor',
  description: 'Plain-text editing with line numbers.',
  category: 'utilities',
  icon: createAppIcon({ glyph: FileText, tone: 'graphite' }),
  component: lazy(() => import('./Editor')),
  window: { width: 760, height: 520, minWidth: 360, minHeight: 240 },
  fileAssociations: [{ extensions: ['.txt', '.md'], role: 'editor', priority: 1 }],
  keywords: ['text', 'notepad'],
});
```

## SDK (`src/_sdk`)

| Hook / helper | Purpose |
| --- | --- |
| `useApp()` | `{ pid, windowId, appId, container }` |
| `useArgs(initial)` | launch args; singletons get updates when launched again |
| `useWindowControls()` | `setTitle`, `setDirty`, `setDocument`, `close`, `quit`, `minimize`, `toggleMaximize`, `focused`, `window` |
| `useTitle(title)`, `useDirty(bool)` | keep window chrome in sync |
| `useCloseGuard(fn)` | veto closing (unsaved changes) |
| `useAppMenus(menus, deps)` | contribute menubar menus; shortcuts on items are bound while focused |
| `useShortcut(keys, handler)` | one shortcut while focused (`"Mod+S"`) |
| `useShortcutLabel()` | format keys for display per user preference |
| `useNotify()` | post a notification from this app |
| `useLauncher()` | `launch(appId, args)`, `open(path)` |
| `useDirectory(path)` | live folder listing |
| `useVfsWatch(path, cb)` | react to file changes |
| `useTextDocument(path)` | text + dirty tracking + save/saveAs, syncs title |
| `useObjectUrl(path)` | blob URL for media |
| `useJsonFile(path, fallback)` | app data persisted as JSON |
| `useFilePicker()` | Open / Save / Choose-folder dialog over the VFS |
| `useDialogs()` (from `@lumen/ui`) | `confirm`, `prompt`, `alert`, `choose` — window-modal |
| `createAppIcon({ glyph, tone })` | the app tile |
| `FileTypeIcon`, `fileGlyph` | icons for files |
| `formatTime/Date/DateTime/Relative` | region-aware formatting |

Kernel access: `useKernel()`, `useVfs()`, `usePlatform()`, `useSettings()`,
`useSetting(section)`, `useProcesses()`, `useWindows()`, `useApps()` from
`@lumen/kernel/react`. Path helpers from `@lumen/vfs`.

## Rules

- Compose from `@lumen/ui`. Tailwind utilities over the tokens
  (`bg-surface text-ink border-rule text-ink-2 mono`). No new colours.
- Persist under the user's home (`kernel.home`), e.g.
  `join(kernel.home, '.config', 'calendar.json')`, through the VFS.
- Logic in plain `.ts` with tests. Components stay thin.
- Every control is keyboard reachable. Numbers are `tabular-nums` mono.
- No emoji, no gradients, no glows. Read `CLAUDE.md` → Design rules.
