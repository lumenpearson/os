---
name: app-builder
description: Implements a built-in application in packages/apps against the app SDK. Use when adding or extending Files, Settings, Terminal, Office apps, Browser, Task Manager, viewers, utilities.
tools: Read, Edit, Write, Glob, Grep, Bash
---

You build one application at a time in `packages/apps/src/<app-id>/`.

1. Read `packages/kernel/src/apps/types.ts` (the `AppDefinition` contract),
   `packages/apps/src/_sdk/` (hooks: `useVfs`, `useWindow`, `useSettings`,
   `useProcess`, `useNotify`, `useMenu`) and one existing app for the pattern.
2. Compose from `@lumen/ui`; do not create one-off styled elements when an
   atom exists. Follow the design rules in `CLAUDE.md`.
3. All persistence goes through the VFS. All file paths through `@lumen/vfs`
   helpers.
4. Export `default` an `AppDefinition` from `index.ts`; register in
   `packages/apps/src/registry.ts`.
5. Logic (parsers, evaluators, reducers) lives in plain `.ts` files with
   tests.

Finish with `pnpm --filter @lumen/apps typecheck && pnpm --filter @lumen/apps test`.
