# Interface patch updates

The desktop build updates itself by replacing its interface, not by
downloading a new executable and running an installer. This describes how.

## Why

Lumen's interface is a web bundle. Today it is compiled into the executable,
so the only way to change a button is to ship a new installer and ask the
person to run it. Almost every change Lumen makes is a change to that bundle,
which means almost every change is charged the price of a full reinstall.

A patch avoids that price. It cannot avoid all of it: new kernel commands and
native fixes live in the binary and no patch can replace them. So the honest
division is that patches carry the interface and the applications — nearly all
of Lumen — and a release that needs the binary says so and asks for a real
update instead of pretending.

## Constraints

- **The embedded bundle is the floor.** A Lumen that has never updated, or
  whose patch is unreadable, must still open. The bundle compiled into the
  binary is never removed and is always the fallback.
- **A patch is code that runs with the app's kernel access.** It is verified
  before it is unpacked, or it is not unpacked.
- **A half-applied update must not be possible.** The pointer that names the
  live version is written last and atomically; every earlier step is
  reversible by ignoring it.
- **One bad patch must not brick the installation.** There is nobody to walk
  over and fix it, which is the whole reason the update is silent.
- **The web build has no updater.** It is current whenever the page loads.
  Its Settings screen says that rather than showing a control that does
  nothing.

## Where the interface lives

The host registers a `lumen://` URI scheme. Its handler resolves each request
in one of two places, in order:

1. `<data dir>/interface/<version>/` — the applied patch, if there is one.
2. The bundle embedded in the binary, through Tauri's asset resolver.

`<data dir>` is `%LOCALAPPDATA%\LumenOS` on Windows and the platform
equivalent elsewhere, beside the existing host configuration.

    interface/
      current.json          the pointer: { version, appliedAt, previous }
      0.2.0/                an applied bundle
      0.1.0/                the one before it, kept for rollback

The main window opens `lumen://index.html` instead of the default
`tauri://localhost`. The resolver refuses any path that escapes the version
directory after normalisation, for the same reason the store middleware does.

### Applying

1. Download the archive to a temporary file.
2. Verify its signature and its SHA-256 against the manifest.
3. Extract to `interface/<version>.incoming`, refusing any entry whose path
   escapes that directory.
4. Rename to `interface/<version>`.
5. Write `current.json` naming the new version and the one it replaces.

A crash at steps 1–4 leaves an unreferenced directory and a valid pointer, so
the next start is unaffected; a sweep removes anything the pointer does not
name apart from the one previous version.

### Rollback

The shell calls an `interface_ready` command once it has mounted. The host
records that the live version booted. If a start with a version that has never
been recorded reaches its deadline without that call, the host rewrites the
pointer to `previous`, notes what happened, and the interface that comes up
says which version it fell back to and why.

This is the piece that makes silent updates defensible. Without it, one bad
patch is unrecoverable on every machine at once.

## What is published

Each release publishes two files to a fixed `updates` tag, so their addresses
never change and no GitHub API call — and no rate limit — sits in the path:

    https://github.com/lumenpearson/os/releases/download/updates/latest.json
    https://github.com/lumenpearson/os/releases/download/updates/lumen-interface-<version>.tar.gz

`latest.json`:

```json
{
  "version": "0.2.0",
  "url": "https://github.com/.../lumen-interface-0.2.0.tar.gz",
  "size": 2947213,
  "sha256": "…",
  "signature": "…",
  "minimumHost": "0.1.0",
  "notes": "One paragraph, shown in Settings."
}
```

`minimumHost` is what keeps the native constraint honest. When a release needs
Rust changes it names the host version that carries them; an older binary
refuses the patch and says a full update is required, rather than applying an
interface its kernel cannot serve.

### Signing

Ed25519, verified with `minisign-verify` — the same primitive Tauri's own
updater uses, a small crate with a standard CLI for the signing half. The
public key is a constant in the host. The private key lives in GitHub Actions
secrets and nowhere else.

The signature covers the archive bytes. The manifest is not signed and does
not need to be: a manifest that names a payload whose signature does not
verify is refused at the payload, and a manifest that names an older version
is refused by the version comparison.

## Where the code goes

Following the dependency direction — `tokens ← ui ← kernel ← apps ← shell`,
with `platform` under `kernel`:

- **`crates/lumen-kernel`** — the fetch, the verification, the extraction, the
  pointer, the rollback bookkeeping and the path guards. Tested without a
  WebView, as the rest of that crate is.
- **`apps/desktop/src-tauri`** — the `lumen://` resolver and the command table:
  `update_state`, `update_check`, `update_download`, `update_apply`,
  `update_rollback`, `interface_ready`. Download progress is emitted as Tauri
  events rather than polled.
- **`packages/platform`** — an `updates` capability alongside the existing host
  bridge. On the web it reports that updates do not apply here.
- **`packages/kernel/src/services/update.ts`** — the service the plan already
  reserves as Э4.5 (LU-1005): checks on start and on an interval, holds the
  state, raises the notification. Registered in the service catalogue like the
  others, so Task Manager shows it.
- **`packages/apps/src/settings/pages/Updates.tsx`** — the screen: current
  version, host version, last checked, what a check found, download progress,
  the notes for the pending version, and the history of what has been applied.
  Buttons: Check Now, Download, Restart Now, Roll Back.

Doing the check in Rust rather than in the front end keeps one implementation
and sidesteps CORS on the release host.

## How it behaves

The check runs on start and every six hours. It downloads in the background
without asking, because the answers said so, and nothing about the running
session changes while it does. Progress is visible only to anyone who opens
Settings › Updates.

When the download has been verified and staged, a notification appears with
two buttons: **Restart Now** and **Later**. Later leaves it staged; the patch
is live the next time Lumen opens either way. The notification is the only
interruption in the whole flow.

Failures are quiet in the notification and loud in Settings: a check that
cannot reach the host, a signature that does not verify and a payload that
does not match its hash are all recorded with what was tried, and the last of
those is worth saying plainly because it is the one that means something is
wrong rather than merely unavailable.

## Errors

| What happens | What Lumen does |
| --- | --- |
| The manifest cannot be fetched | Nothing visible; recorded in Settings with the time and reason. |
| The manifest names a version this host is too old for | Recorded, and Settings says a full update is needed and links to it. No download. |
| The signature does not verify | The payload is deleted and the failure is recorded prominently. No retry until the manifest changes. |
| The hash does not match | Same as the signature: deleted, recorded. |
| Extraction fails, or an entry escapes | The incoming directory is removed; the pointer is untouched. |
| The applied version never reaches `interface_ready` | The pointer reverts to `previous` on the next start, and the interface says so. |
| There is no previous version to revert to | The pointer is cleared and the embedded bundle serves, which is the floor. |

## Testing

- **Rust**: signature verification over a good archive, a tampered archive and
  a wrong key; the apply sequence over a temporary directory, including a
  crash simulated at each step; the sweep keeping exactly the live and
  previous versions; an archive entry that tries to escape; the resolver
  preferring the patch and falling back to the embedded bundle; the
  `minimumHost` refusal; the rollback after a version that never reported.
- **TypeScript**: the service's state machine over a fake bridge — idle,
  checking, found, downloading, staged, failed; the Settings screen for each
  of those states; the notification's buttons; the web build reporting that
  updates do not apply.
- **End to end**: the update path cannot be exercised against a real release
  in CI without publishing one, so the state machine tests carry it. The one
  end-to-end assertion worth having is that the desktop build serves its
  interface over `lumen://` and opens.

## Stages

**Stage 1 — the patchable interface.** The resolver, the versions directory,
the pointer, the sweep, `interface_ready` and rollback, and a Settings screen
that shows the current version and nothing it cannot yet do. No network. A
bundle applied by hand proves the whole mechanism, and this is the half that
can fail quietly, so it ships and settles on its own.

**Stage 2 — the update service.** The manifest, signature verification, the
background download with progress, the notification and its buttons, the
restart, the rollback control, and the release workflow that builds, signs and
publishes.

## What this does not do

- It does not update the binary. That remains an installer, and Lumen says so
  when a release needs one.
- It does not patch per file. The bundle is two to three megabytes; a delta
  format would save little and cost a great deal of machinery that can fail
  halfway.
- It does not offer channels. One published version at a time until there is a
  reason for more.
