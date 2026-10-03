# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A self-hosted web app for a home server that syncs music from Spotify into a Jellyfin library.

Intended shape:

- **Configured by environment variables.** Spotify API credentials and the Jellyfin library directories come from the environment and are read at startup — the typical self-hosted/Docker shape, set once in `docker-compose.yml` or the unit file. They are *not* entered through the web UI and *not* persisted by the app. Changing them means restarting the server. Validate them at boot and fail fast with a clear message rather than erroring on first sync.
- **Tracks are fetched and written into the configured directories.**
- **Jellyfin's standard `Artist / Album` layout** (see below). File placement is derived from track metadata, not freely chosen per song.
- **Playlists are `.m3u` files**, written to `Playlists/` and referencing tracks by path. A song exists once on disk but may appear in any number of playlists.
- **Auto-sync.** Continuous/scheduled background syncing, not a manual one-shot import. Implies a long-running job plus some way to surface its status and failures in the UI.

### Library layout

```
music/
├── Daft Punk/
│   ├── Discovery (2001)/
│   │   ├── 01 - One More Time.mp3
│   │   └── 02 - Aerodynamic.mp3
│   └── Random Access Memories (2013)/
│       └── 08 - Get Lucky.mp3
├── Various Artists/
│   └── Guardians of the Galaxy Vol. 1 (2014)/
│       └── 01 - Hooked on a Feeling.mp3
└── Playlists/
    ├── Gym.m3u
    └── Chill.m3u
```

Conventions that this layout encodes, all of which the sync has to get right:

- `AlbumArtist / Album (Year) / NN - Title.ext`
- Compilations group under **`Various Artists`**, keyed on *album artist*, not track artist. Keying on track artist instead is the classic bug that shatters one album across a dozen folders.
- Jellyfin reads **embedded tags first**; the directory names are the organizational fallback. Writing correct ID3/Vorbis tags is therefore part of the sync, not an optional polish step — path and tags must agree.
- Track numbers are zero-padded so lexical and track order match.
- Characters illegal in a path (`/ \ : * ? " < > |`, trailing dots/spaces) have to be sanitized out of artist/album/title, and that sanitization must be deterministic — the same track must resolve to the same path on every sync run, or re-syncs duplicate files.

### Status

**None of this is implemented.** The repository is an early scaffold: only `.gitignore`, `LICENSE`, and `README.md` are tracked by git, everything under `backend/` is untracked work in progress (currently a hello-world Express app), and `frontend/` is an empty directory. Treat the above as intended scope, not as a description of existing code.

### Domain notes

- The Spotify Web API serves metadata, playlists, and catalogue search — it does not serve audio files. Acquiring the actual audio is therefore a separate component from the Spotify integration, and the two should not be conflated when designing the sync pipeline.
- **Library placement and playlist membership are two separate subsystems.** Placement is metadata-driven and one-to-one: a track lands at exactly one `AlbumArtist/Album/` path. Playlist membership is many-to-many and lives entirely in the `.m3u` files. A Spotify playlist therefore does *not* map to a folder — it maps to one `.m3u` whose entries point at tracks scattered across the library.
- **`.m3u` files store paths, so they break when files move.** Any rename, re-tag, or change to the sanitization rules invalidates every playlist referencing the affected track. Treat playlist files as derived artifacts regenerated from persisted state, never as the source of truth. Prefer paths relative to the playlist file over absolute ones — absolute paths break the moment the host and container disagree about where the library is mounted.
- Spotify credentials arrive as environment variables, so the app never stores them — but it must also never leak them: keep them out of logs, out of error messages, and out of any config or status endpoint the web UI reads.
- Two distinct kinds of state, and the split matters: **environment** holds deployment configuration (credentials, the library root path), **persistence** holds application data (Spotify-track → local-file identity, playlist membership, sync history). Don't push the latter into env vars or the former into the database.
- The durable mapping worth getting right early is **Spotify track ID → the file on disk**. Everything else is recomputable from it: the path from tags, the `.m3u` entries from playlist membership. Without it, a re-sync cannot tell "already have this" from "new track," and the library accumulates duplicates.

## Layout

- `backend/` — Express 5 API, TypeScript, ESM
- `frontend/` — empty placeholder, no toolchain chosen yet

## Commands

Run from `backend/`:

```bash
npm run build      # tsc -> dist/
npm start          # prestart runs build, then node dist/index.js
npm run dev        # node --watch src/index.ts (native type stripping)
npx tsc --noEmit   # typecheck only
```

No test runner, linter, or formatter is configured. Don't reference `npm test` or `npm run lint` — they don't exist.

## Toolchain constraints

These are the things that bite. Most Express+TypeScript tutorials predate all of them.

### TypeScript 7

`backend` runs TypeScript **7.x** (the native port), not 5.x. TS 7 *removed* the long-deprecated options rather than warning about them, so they fail as `error TS5023: Unknown compiler option`:

`charset`, `keyofStringsOnly`, `noImplicitUseStrict`, `out`, `prepend`, `suppressExcessPropertyErrors`, `suppressImplicitAnyIndexErrors`, `noStrictGenericChecks`, `preserveValueImports`, `importsNotUsedAsValues`

Enum values also shrank: `target` no longer accepts `es3`/`es5`, `module` dropped `amd`/`umd`/`system` (and gained `node18`/`node20`), and `moduleResolution` accepts only `node16`, `nodenext`, `bundler`.

When unsure whether an option exists, ask the compiler rather than guessing:

```bash
./node_modules/.bin/tsc --someOption BOGUS    # prints the valid values
./node_modules/.bin/tsc --help --all | grep -A3 someOption
```

### ESM only — this is the big one

`backend/package.json` sets `"type": "module"`.

- **Relative imports need an explicit `.js` extension**, even though the source is `.ts`. Write `import app from './app.js'`, not `'./app'`. Omitting it is `error TS2835`.
- **Never switch `module` to `commonjs`.** It typechecks fine, then the emitted `require`/`exports` crashes at startup with `ReferenceError: exports is not defined in ES module scope`, because Node reads `dist/*.js` as ESM.

### verbatimModuleSyntax

Enabled, so imports are emitted verbatim and type-only bindings must say so. The common tutorial line fails with `error TS1484`:

```ts
import express, { Request, Response } from 'express';          // TS1484
```

```ts
import express from 'express';                                  // correct
import type { Request, Response } from 'express';
```

This is not pedantry — `express` has no runtime export named `Request`, so the un-annotated form would throw at import time under ESM.

### Build layout contract

`rootDir: ./src` and `outDir: ./dist` are both required, and `npm start` depends on `dist/index.js` landing at exactly that path.

`rootDir` in particular is load-bearing: without it TypeScript infers the root from the longest common prefix of the input files, so adding any `.ts` outside `src/` silently relocates output to `dist/src/index.js` while `tsc` still exits 0. Keeping it pinned turns that into `error TS6059` instead.

### Node runtime

Node v24 runs `.ts` directly via type stripping. `ts-node` was deliberately removed — do not reintroduce it, `tsx`, or any other transpiling dev runner. Use `node --watch src/index.ts`.

Type stripping only erases; it cannot compile enums, parameter properties, or namespaces. Avoid them in `src/`, or they'll pass `tsc` and fail under `npm run dev`.

### Strictness

Beyond `strict`, the config enables `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noImplicitOverride`, `noUnusedLocals`, and `noUnusedParameters`. Prefix intentionally-unused parameters with `_` (e.g. `(_req: Request, res: Response)`).

## Backend structure

Keep the two entry files separated by responsibility:

- `src/app.ts` — builds and exports the configured Express app. **No side effects**: no `listen`, no port reading. This keeps it importable from tests and scripts without starting a server.
- `src/index.ts` — owns the port and calls `app.listen`.
