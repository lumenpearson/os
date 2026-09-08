# Getting help

## Before you ask

Most questions are answered by three files in the repository root:

- `README.md` — what Lumen OS is, and how to run it.
- `ARCHITECTURE.md` — how the packages fit together and which one owns what.
- `CONTRIBUTING.md` — the workflow, the commands, and what a change has to pass.

If you are trying to build the desktop app, `docs/BUILDING.md` covers the
per-platform prerequisites.

## Where to put what

| You have | Use |
| --- | --- |
| Something behaves incorrectly | [Bug report](https://github.com/lumenpearson/os/issues/new?template=bug_report.yml) |
| Something is missing | [Feature request](https://github.com/lumenpearson/os/issues/new?template=feature_request.yml) |
| A question, or an idea that is not yet a request | [Discussions](https://github.com/lumenpearson/os/discussions) |
| A security vulnerability | [Private advisory](https://github.com/lumenpearson/os/security/advisories/new) — see `SECURITY.md`. Never a public issue. |

## What makes a bug report useful here

Lumen OS runs in two quite different hosts, and most reports that go nowhere
are the ones where nobody can tell which host was involved. So please say:

- **Which host** — a browser (and which one), or the desktop build (and which
  operating system). The file system, the window manager and the system
  information all differ between them.
- **Which version or commit.** System Information → Copy Report puts the
  build, the host and the browser on your clipboard in one go.
- **What you did, what you expected, and what happened instead** — in that
  order, and concretely enough to follow.

If the problem is visual, a screenshot is worth more than a description. If it
involves an app's data, the relevant file under your home directory usually
tells the story faster than anything else.

## What to expect

This is a small project. Issues are read, but there is no response-time
commitment and no support contract. A clear report that someone can reproduce
is far more likely to be fixed than a fast one that nobody can.
