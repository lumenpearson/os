# AI usage policy

Lumen OS is built with AI coding agents in the loop. This document sets the
rules for how AI assistance is used in this repository, so contributors and
users know what to expect.

## 1. Scope

This policy covers every AI-assisted contribution to the repository: code,
documentation, tests, design assets, commit messages, review comments, and
issue triage. It applies to maintainers and outside contributors alike.

## 2. Principles

1. **A person is accountable for every change.** An AI agent may write the
   diff, but the person who opens the pull request owns it, has read it, and
   can explain it.
2. **AI output is a draft, not a decision.** Architecture, security posture,
   licensing, and user-facing behaviour are decided by humans and recorded in
   `ARCHITECTURE.md`, ADRs, or the pull request itself.
3. **Verification is not optional.** AI-authored code ships only after the same
   checks as any other code: `pnpm check` (lint, typecheck, unit tests,
   build), `cargo clippy`, `cargo test`, and, for UI, a visual review of the
   running app.
4. **No secrets, no private data.** Never paste credentials, tokens, customer
   data, or unreleased third-party material into an agent session or prompt.
5. **Respect licences.** AI-generated code must not reproduce licensed code
   verbatim. If an agent pulls in a dependency or a vendored file, its licence
   is recorded (see `.claude/skills/kill-ai-slop/LICENSE` for an example).

## 3. Disclosure

- Commits authored or co-authored by an agent carry a `Co-Authored-By` trailer
  naming the agent. Do not strip it.
- Pull requests that are substantially AI-generated say so in the description.
- Review comments posted by an agent end with an attribution line.

## 4. What agents may do without asking

- Create branches, commits, and **draft** pull requests.
- Run any command inside the repository sandbox: install dependencies, build,
  test, lint, format, run dev servers, take screenshots.
- Refactor within the scope of the task they were given.
- Fix CI failures on pull requests they opened.

## 5. What requires a human decision

- Merging to `main`.
- Publishing releases, tags, or packages.
- Production deployments outside the preview flow (Vercel previews are fine;
  promoting to production is a human action).
- Changing licences, this policy, the code of conduct, or security settings.
- Adding telemetry, analytics, or any network call that sends user data.
- Deleting user data or changing the on-disk layout of the Lumen OS home
  directory in a way that is not backwards compatible.

## 6. Design quality

AI-generated interfaces tend toward a recognisable set of defaults. Every UI
change is checked against the vendored `kill-ai-slop` skill
(`pnpm deslop`) and against the design rules in `CLAUDE.md`. A change that
fails that review is not finished.

## 7. Data used by agents

Agents operating on this repository read the repository and public
documentation. They do not have access to user machines, user files, or any
Lumen OS home directory. The Tauri build never sends data to an AI service; the
OS itself contains no AI features unless a user installs one explicitly.

## 8. Reporting

If you believe AI-assisted output in this repository violates this policy,
another project's licence, or someone's rights, open an issue or email
**lumenpearson@gmail.com**. Reports are handled like security reports (see
`SECURITY.md`).
