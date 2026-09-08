# The Lumen store format

A store is a directory of static files served over HTTPS. Nothing here needs
a server: the whole catalogue is JSON and package payloads, fetched with
`GET` and cached by the client. That is the point — the store lives in its
own repository, is deployed on its own, and the OS only ever needs a base
URL.

## Layout

```
index.json              the catalogue: everything the storefront draws
packages/<id>.json      one package, in full
payload/<id>-<ver>.json the bytes a download actually pulls
banner/<id>.json        a banner's artwork, as a token recipe
```

Every path in `index.json` is relative to the base URL, so a store can be
moved between hosts without editing its contents.

## `index.json`

```jsonc
{
  "format": 1,             // bumped only for a breaking change
  "name": "Lumen Store",
  "updated": "2026-09-05T00:00:00Z",
  "packages": [PackageSummary],
  "sections": [Section],   // the storefront's rows, in order
  "banners": [Banner],     // the wide cards at the top
  "collections": [Collection]
}
```

## `PackageSummary`

The fields the storefront needs to draw a tile, and no more. The full
document lives at `packages/<id>.json`.

```jsonc
{
  "id": "com.lumen.pomodoro",   // reverse-dns, [a-z0-9_.-]{2,64}
  "kind": "app",                // app | font | icons | bundle
  "name": "Pomodoro",
  "tagline": "A timer that keeps the hour honest.",
  "version": "1.2.0",
  "publisher": "Lumen",
  "category": "utilities",
  "size": 4821,                 // payload bytes, exact
  "price": "free",              // free | subscription
  "keywords": ["timer"],
  "updated": "2026-09-05T00:00:00Z"
}
```

## `Package`

`PackageSummary` plus:

```jsonc
{
  "description": "Several paragraphs, plain text.",
  "payload": "payload/com.lumen.pomodoro-1.2.0.json",
  "sha256": "…",               // of the payload file's bytes, lowercase hex
  "requires": { "os": ">=0.1.0" },
  "capabilities": ["storage"],  // what installing it allows
  "screenshots": [Artwork],
  "releaseNotes": "What changed in this version.",
  "members": ["com.lumen.a"]   // kind=bundle only: the packages it installs
}
```

## `payload/<id>-<version>.json`

The bytes the download pulls, and the only file whose size and digest are
checked. Its shape depends on `kind`:

- `app` — an `AppManifest`, exactly as `Kernel.parseManifest` reads it.
- `font` — `{ "family": …, "faces": [{ "weight": …, "style": …, "src": … }] }`
  where `src` is a `data:` URL, so a font never needs a second request.
- `icons` — `{ "prefix": …, "icons": { "<name>": "<svg path data>" } }`.
- `bundle` — no payload; `members` are downloaded instead.

## `Section` and `Collection`

```jsonc
{ "id": "essentials", "title": "Essentials", "packages": ["com.lumen.pomodoro"] }
```

A `Collection` adds `"tagline"` and `"artwork"`, and is drawn as a card that
opens a list. A `Section` is a row of tiles.

## `Banner`

```jsonc
{
  "id": "welcome",
  "title": "Five programs to start with",
  "text": "One sentence.",
  "target": { "kind": "collection", "id": "essentials" },
  "artwork": Artwork
}
```

## `Artwork`

No image files. Artwork is a recipe the client draws with the system's own
tokens, so it is themed, sharp at every scale, and weighs nothing:

```jsonc
{ "shape": "rings" | "grid" | "ramp" | "type", "seed": 7, "tone": "accent" | "neutral" }
```

## Rules the client enforces

1. A document that does not parse, or whose `format` is newer than the
   client knows, is refused whole. A half-read catalogue is worse than none.
2. `size` and `sha256` are checked against the payload after it arrives. A
   mismatch fails the install and says which one.
3. Nothing in the store may name a built-in app's id; the OS would shadow it.
4. Every fetch is `GET` with no credentials. The store never sees who asked.
