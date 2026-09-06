# Security policy

## Supported versions

Only the latest release on `main` receives security fixes.

## Reporting a vulnerability

Email **lumenpearson@gmail.com** with the subject `[lumen-os security]`.
Include steps to reproduce, the affected component (`web`, `desktop`,
`kernel`, `landing`), and the impact you believe it has. You will receive an
acknowledgement within 72 hours.

Please do not open public issues for security problems.

## Scope notes

- **Desktop sandbox.** The Tauri build confines file operations to the
  configured Lumen OS home directory. Path traversal out of that directory is
  a vulnerability; report it.
- **Web build.** The browser build stores everything in origin-private storage
  (OPFS / IndexedDB). It makes no network calls except to load its own assets
  and to whatever URL the user types into the Browser app, which is rendered
  in a sandboxed iframe.
- **Pseudo-programs.** User-installable `.app` bundles that embed HTML run in a
  sandboxed iframe with no access to the host file system. Escaping that
  sandbox is a vulnerability.
