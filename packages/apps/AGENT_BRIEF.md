# Brief for app-building agents

You are implementing ONE built-in application of Lumen OS inside
`packages/apps/src/<app-folder>/`. Do not touch files outside that folder
(except adding tests next to your code). Other agents are building other apps
in parallel in sibling folders, so ignore type errors that are not in your
folder. The registry (`packages/apps/src/registry.ts`) is assembled by the
lead after all apps are done — do NOT create or edit it.

## Read first (in this order)
1. `packages/apps/README.md` — the SDK and the app pattern.
2. `packages/apps/src/webapp/` — a small complete reference app.
3. `packages/apps/src/_sdk/*.ts(x)` — the hooks you will use (read the real signatures).
4. `packages/kernel/src/types.ts`, `packages/kernel/src/react/index.ts`, `packages/kernel/src/settings/schema.ts`, `packages/kernel/src/kernel.ts` (public methods), `packages/kernel/src/index.ts` (exports).
5. `packages/ui/src/index.ts` and the components it exports (atoms, molecules, organisms, templates) — compose from these; use Tailwind utility classes over the tokens (`bg-surface`, `bg-canvas`, `bg-surface-2`, `text-ink`, `text-ink-2`, `text-ink-3`, `border-rule`, `border-rule-strong`, `bg-accent`, `text-accent`, `bg-selection`, `text-danger`, `mono`, `rounded-sm/md/lg`, `shadow-sm/md`, `duration-(--duration-fast)`, `ease-(--ease-standard)`), and `cx()` for class joins. The type scale: `text-2xs text-xs text-sm text-base text-md text-lg text-xl text-2xl`.
6. `packages/vfs/src/index.ts` — path helpers (`join`, `basename`, `dirname`, `extname`, `isValidName`), `Vfs` methods (`readDir`, `readText`, `writeText`, `readJson`, `writeJson`, `readFile`, `writeFile`, `mkdir`, `ensureDir`, `remove`, `rename`, `copy`, `copyInto`, `moveInto`, `trash`, `restoreFromTrash`, `emptyTrash`, `createFolder`, `createFile`, `freeName`, `search`, `walk`, `du`, `usage`, `objectUrl`, `subscribe`), `formatBytes`, `fileCategory`, `mimeType`.
7. `CLAUDE.md` → Design rules and Engineering rules. Hold every one of them.

## Non-negotiable rules
- TypeScript strict with `noUncheckedIndexedAccess`; no `any` (use `unknown` + narrowing).
- Default export from `index.tsx` is `defineApp({...})` with a `lazy()` component. `index.tsx` must not import the component eagerly.
- Persist app data under the user's home through the VFS (`useKernel().home`, e.g. `join(kernel.home, '.config', '<app>.json')` via `useJsonFile`), never `localStorage`.
- Pure logic (parsers, evaluators, reducers, board generation, formatting) lives in `.ts` files with Vitest tests (`*.test.ts` next to the code). Components are thin.
- Every interactive element is a real `<button>`/`<input>`/… or has a role + keyboard handler + visible focus (`lumen-focus` class). Menus use `useAppMenus` so shortcuts appear in the menubar.
- Anything that moves at pointer rate (drag, resize, drawing) writes to the DOM via refs inside `requestAnimationFrame`, not React state per event.
- Design: IBM Plex Sans body, JetBrains Mono (`mono` class) for labels/values/paths/numbers (`tabular-nums`); ONE accent colour; neutral surfaces; hairline borders; no gradients, glows, coloured shadows, emoji, badge spam, icon tiles tinted in their own colour, kicker labels, invented statistics, or hover scaling. Copy is specific and short.
- Icons: `lucide-react` only. App icon via `createAppIcon({ glyph, tone })` with the tone given in your spec.
- No new dependencies. No network calls (except where the spec says so).
- Respect the window: your root element fills the window (`h-full w-full flex flex-col`), scrolls internally (`lumen-scroll` on the scrolling region), works from 360×240 up to 4K, and reads well in light and dark themes.

## Verify before you finish (all from /home/user/os)
```
pnpm --filter @lumen/apps exec tsc -p tsconfig.json 2>&1 | grep "src/<app-folder>/"   # must print nothing
pnpm exec biome check --write packages/apps/src/<app-folder>                            # then re-run without --write: must be clean
pnpm --filter @lumen/apps exec vitest run src/<app-folder>                              # all green
node .claude/skills/kill-ai-slop/scripts/scan.mjs packages/apps/src/<app-folder>        # fix real hits
```
Report: files created, features implemented, what you verified (paste the final lines), and anything left out.
