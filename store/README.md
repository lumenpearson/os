# The Lumen Store

A store is a directory of static files. There is no server, no database and no
API: the catalogue is JSON, the packages are JSON, and a client fetches them
with `GET`. `FORMAT.md` is the contract; this file is about the directory that
implements it.

Everything under `store/` is either authored source (`src/`) or generated
output (`index.json`, `packages/`, `payload/`, `banner/`). The generated files
are committed, because they are what gets deployed and because a diff of them
is the clearest review of a catalogue change.

## Layout

```
FORMAT.md               the contract, shared with the OS client
README.md               this file
index.json              generated — the catalogue the storefront draws
packages/<id>.json      generated — one package, in full
payload/<id>-<ver>.json generated — the bytes a download pulls
banner/<id>.json        generated — one banner, in full
src/                    authored — plain .mjs modules exporting data
  index.mjs             the catalogue: name, format version, everything else
  apps/*.mjs            one module per program, each an AppManifest
  fonts/index.mjs       the four font packages
  fonts/truetype.mjs    a TrueType writer, for the two faces drawn here
  fonts/glyphs.mjs      the outlines those two faces are made of
  fonts/files/          real woff2 files and their licences
  icons/index.mjs       the three icon sets, as path data
  bundles.mjs           the three bundles
  storefront.mjs        sections, collections and banners
```

## Building

```bash
pnpm store                              # regenerate everything
node scripts/build-store.mjs --check    # fail if the committed output is stale
node scripts/build-store.mjs --selftest # run the validator's own checks
```

The build reads `src/index.mjs`, checks it, and writes the four generated
kinds of file. Sizes and `sha256` digests are taken from the bytes it has just
written, with `node:crypto`, so what a client verifies is what it downloaded.

It is idempotent. Two runs over unchanged source produce identical bytes: the
catalogue timestamp is a constant in `src/index.mjs` rather than a reading of
the clock, the synthesised fonts have fixed creation stamps, and every document
is serialised the same way. A second run reports `0 written`.

It validates before it writes anything, and refuses the whole catalogue rather
than emitting part of one. It rejects a duplicate id, an id that is not
reverse-dns or does not match `[a-z0-9_.-]{2,64}`, an id in the OS's own
`lumen.` namespace (the OS would shadow it), a payload holding something JSON
cannot carry or that fails a round trip, a font face that is not a `data:` URL,
two faces with the same weight and style, icon path data that is not path data,
a bundle naming a member that does not exist or that is itself a bundle, a
section or collection naming a missing package, a banner pointing at nothing,
and a package that no section, collection or bundle links to.

The validator's own checks — eighteen of them, each building a deliberately
broken catalogue and asserting it is refused — run before every build and can
be run alone with `--selftest`.

## Moving this into its own repository

The directory is written to be lifted out whole. Nothing in `src/` imports from
`@lumen/*` or from anywhere above `store/`; the program stylesheet is a
deliberate copy of the OS's rather than an import, and the font files live in
`src/fonts/files/` rather than in `node_modules`.

1. **Copy the directory.** `cp -R store /path/to/lumen-store` — all of it,
   including `src/` and the generated JSON.
2. **Take the build script with it.** `cp scripts/build-store.mjs
   /path/to/lumen-store/scripts/build-store.mjs`. It resolves both its input
   and its output relative to its own file (`../store/src/index.mjs` and
   `../store/`), so keep the same two-level shape: `scripts/build-store.mjs`
   beside `store/`. If you would rather have the catalogue at the repository
   root, change the two constants at the top of the script — `STORE_DIR` and
   `SOURCE` — and nothing else.
3. **Give it a package.json.** `{ "type": "module", "scripts": { "store":
   "node scripts/build-store.mjs" } }` is enough. The build uses only Node's
   standard library, so there are no dependencies to install.
4. **Deploy it as static files.** Any static host will do — object storage
   behind a CDN, GitHub Pages, a plain nginx root. Three things matter:
   - serve `.json` as `application/json`;
   - send `Access-Control-Allow-Origin: *`, because the OS fetches the store
     from a different origin than its own;
   - do not require credentials or cookies. Every fetch is a plain `GET`, and
     the store is not supposed to learn who asked.
   Cache `payload/` hard — those files are content-addressed by the version in
   their name — and cache `index.json` briefly, since it changes on every
   release.
5. **Point the OS at it.** Open Settings in the OS and set the store origin to
   the new base URL, for example `https://store.example.com/`. Every path in
   `index.json` is relative to that base, so nothing inside the catalogue needs
   editing when it moves.

## Adding a package

1. Write the module. Programs go in `src/apps/<name>.mjs` and export the result
   of `appPackage()` from `src/apps/shared.mjs`, which wraps an `AppManifest`
   in the catalogue fields. Fonts, icon sets and bundles are plain objects in
   their own modules.
2. Register it. Add it to the list in `src/apps/index.mjs`,
   `src/fonts/index.mjs`, `src/icons/index.mjs` or `src/bundles.mjs`.
3. Link to it. Put its id in at least one section or collection in
   `src/storefront.mjs`, or in a bundle's `members`. The build refuses a
   package nothing links to, because an unreachable package is a package nobody
   can install.
4. Move `UPDATED` in `src/index.mjs` to the release date.
5. Run `pnpm store` and commit the generated files with the source.

Field rules the build enforces, beyond what `FORMAT.md` states:

| Field        | Rule                                                                     |
| ------------ | ------------------------------------------------------------------------ |
| `id`         | reverse-dns, `[a-z0-9_.-]{2,64}`, not under `lumen.`                      |
| `version`    | `major.minor.patch`                                                       |
| `category`   | utilities, developer, office, media, internet, games, fonts, icons, bundles |
| `price`      | `free` or `subscription`                                                  |
| `updated`    | `YYYY-MM-DDTHH:MM:SSZ`                                                    |
| `tagline`    | at most 80 characters                                                     |
| `description`| 120 to 4000 characters, plain text, blank line between paragraphs         |
| `artwork`    | shape rings, grid, ramp or type; seed 0–9999; tone accent or neutral      |

A bundle carries no payload, so its `size` is the sum of its members' payload
sizes — what installing it actually downloads.

## What is in here

Twelve programs, each a single HTML document that runs in the OS's sandboxed
frame: a regex tester, a diff viewer, a CSV table, a Base64 and hex encoder, a
cron explainer, a contrast checker, a word sampler, an ID generator, a bezier
editor, a metronome, a stopwatch and a timestamp converter. Every one of them
works offline, stores its state through the frame's storage bridge, and is
reachable from the keyboard.

Four fonts. Two carry real files: the Latin italics of IBM Plex Sans and
JetBrains Mono, the faces the OS already ships upright, taken from the same
open-licensed releases the OS vendors and embedded as `data:` URLs. Their woff2
files and their SIL Open Font License 1.1 texts are in `src/fonts/files/`. The
other two — a seven-segment face and a face of Unicode block and box-drawing
characters — are drawn by this repository: both are made entirely of
axis-aligned rectangles, so `src/fonts/truetype.mjs` can write real, valid
TrueType files from `src/fonts/glyphs.mjs` at build time. No font bytes in this
catalogue were invented.

Three icon sets — weather, transit and studio — each a set of path data on a 24
unit grid, meant to be stroked at 2 units with round caps and joins.

Three bundles that install several of the above together.
