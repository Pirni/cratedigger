# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A self-hosted web app for a home server that syncs music from Spotify into a Jellyfin library.

Intended shape:

- **Configured by environment variables.** Spotify API credentials, the library root, and the admin allowlist come from the environment and are read at startup — the typical self-hosted/Docker shape, set once in `docker-compose.yml` or the unit file. They are *not* entered through the web UI and *not* persisted by the app. Changing them means restarting the server. Validate them at boot and fail fast with a clear message rather than erroring on first sync.
- **Two roles, `admin` and `user`.** `ADMIN_SPOTIFY_IDS` is a comma-separated allowlist of Spotify user ids; logging in with a listed id makes you an admin. Admins can additionally list all users, delete a user, and set a user's Jellyfin library directory. Everything else is identical for both roles. The role is *derived from env on every request*, never stored in the database — otherwise the two drift.
- **One user folder ↔ one Jellyfin root folder, strictly 1:1.** Each user's `LIBRARY_ROOT/<spotifyUserId>` folder is the root of exactly one Jellyfin library, and each Jellyfin library serves exactly one user. There is no shared library, no user with two roots, and no root serving two users. Enforce it as a uniqueness constraint on the assignment, not just a convention — a duplicated root silently merges two users' music into one library.
- **One directory per logged-in user, named by their email address.** See the layout and the caveats below; email-as-path has sharp edges.
- **Tracks are fetched and written into the per-user directories.**
- **Jellyfin's standard `Artist / Album` layout** (see below). File placement is derived from track metadata, not freely chosen per song.
- **Playlists are `.m3u` files**, written to `Playlists/` and referencing tracks by path. A song exists once on disk but may appear in any number of playlists.
- **Auto-sync.** Continuous/scheduled background syncing, not a manual one-shot import. Implies a long-running job plus some way to surface its status and failures in the UI.

### Library layout

One folder per user named by their **Spotify user id**, each containing a complete,
self-contained music library in the standard `Artist / Album` layout:

```
<library root>/
├── 31xk7f2qha8w9/                      # the user's Spotify id
│   ├── Daft Punk/
│   │   ├── Discovery (2001)/
│   │   │   ├── 01 - One More Time.mp3
│   │   │   └── 02 - Aerodynamic.mp3
│   │   └── Random Access Memories (2013)/
│   │       └── 08 - Get Lucky.mp3
│   ├── Various Artists/
│   │   └── Guardians of the Galaxy Vol. 1 (2014)/
│   │       └── 01 - Hooked on a Feeling.mp3
│   └── Playlists/
│       ├── Gym.m3u
│       └── Chill.m3u
└── 22bq9m4ztc1p7/
    ├── ...
    └── Playlists/
```

Each user subtree gets its own `Playlists/` — playlists never span users. The folder is created on first Spotify login and is what that user's Jellyfin library should point at.

**Two different paths, do not confuse them.** The app writes to `LIBRARY_ROOT/<spotifyUserId>`, derived at runtime. The `users.library_directory` column is the *Jellyfin* root for that user, which an admin configures later and which stays `NULL` until they do — the app and Jellyfin may see the same directory at different mount points (`/music/<id>` for the app, `/media/<id>` for Jellyfin), so it cannot be derived.

Conventions that this layout encodes, all of which the sync has to get right:

- `AlbumArtist / Album (Year) / NN - Title.ext`
- Compilations group under **`Various Artists`**, keyed on *album artist*, not track artist. Keying on track artist instead is the classic bug that shatters one album across a dozen folders.
- Jellyfin reads **embedded tags first**; the directory names are the organizational fallback. Writing correct ID3/Vorbis tags is therefore part of the sync, not an optional polish step — path and tags must agree.
- Track numbers are zero-padded so lexical and track order match.
- Characters illegal in a path (`/ \ : * ? " < > |`, trailing dots/spaces) have to be sanitized out of artist/album/title, and that sanitization must be deterministic — the same track must resolve to the same path on every sync run, or re-syncs duplicate files.

### The Spotify id as a directory name

The id comes from Spotify's `/v1/me` and is then used to build a filesystem path, so treat it as untrusted input:

- **It is a stable key, which is why it was chosen over the email.** A user can change their email; their Spotify id never changes. So the directory never has to be renamed and the `.m3u` paths inside it never break.
- **Still validate it.** Spotify ids are alphanumeric in practice, but the value crosses the network before becoming a path. `..`, `/` and `\` must never survive into a path segment; after joining, resolve the absolute path and assert it is still under `LIBRARY_ROOT`.
- **`ADMIN_SPOTIFY_IDS` is optional and may be empty.** Admins are added by editing the env and restarting, so an empty value is a valid “no admins yet” state, not a misconfiguration — never refuse to boot over it. Ids are trimmed and matched exactly, since Spotify ids are case-sensitive.
- Windows caps paths near 260 characters by default. A long `Artist/Album (Year)/NN - Title.ext` under a long `LIBRARY_ROOT` can realistically exceed it — relevant because this repo is developed on Windows even if it deploys to Linux.

### Status

**Partly implemented.** The download path exists end to end: the `downloads` controller resolves a user's library directory, derives the `Artist / Album (Year) / NN - Title.mp3` path and drives the yt-dlp binary, with per-file progress pollable while a download runs. Nothing is exposed over HTTP yet (`app.ts` still serves hello-world), there is no persistence, no auth, no Spotify integration and no scheduler, and `frontend/` is an empty directory. Everything above this line that is not in `src/features/downloads/` is intended scope, not existing code.

### Design notes

- The Spotify Web API serves metadata, playlists, and catalogue search — it does not serve audio files. Acquiring the actual audio is therefore a separate component from the Spotify integration, and the two should not be conflated when designing the sync pipeline.
- **Library placement and playlist membership are two separate subsystems.** Placement is metadata-driven and one-to-one: a track lands at exactly one `AlbumArtist/Album/` path. Playlist membership is many-to-many and lives entirely in the `.m3u` files. A Spotify playlist therefore does *not* map to a folder — it maps to one `.m3u` whose entries point at tracks scattered across the library.
- **`.m3u` files store paths, so they break when files move.** Any rename, re-tag, or change to the sanitization rules invalidates every playlist referencing the affected track. Treat playlist files as derived artifacts regenerated from persisted state, never as the source of truth. Prefer paths relative to the playlist file over absolute ones — absolute paths break the moment the host and container disagree about where the library is mounted.
- Spotify credentials arrive as environment variables, so the app never stores them — but it must also never leak them: keep them out of logs, out of error messages, and out of any config or status endpoint the web UI reads.
- Two distinct kinds of state, and the split matters: **environment** holds deployment configuration (credentials, the library root, the admin allowlist), **persistence** holds application data (users, per-user Jellyfin roots assigned by admins, Spotify-track → local-file identity, playlist membership, sync history). Don't push the latter into env vars or the former into the database.
- **Every sync, path, and query is scoped to a user.** There is no global library. Any code that builds a path, writes an `.m3u`, or reads sync state needs the user in scope, and a missing-user case should be a hard error rather than a fallback to some default root — a fallback here silently writes one user's music into another's library.
- The durable mapping worth getting right early is **Spotify track ID → the file on disk**. Everything else is recomputable from it: the path from tags, the `.m3u` entries from playlist membership. Without it, a re-sync cannot tell "already have this" from "new track," and the library accumulates duplicates.

## Layout

- `backend/` — Express 5 API, TypeScript, ESM
- `frontend/` — empty placeholder, no toolchain chosen yet

## Commands

Run from `backend/`:

Migrations run automatically at boot; these are for authoring and rollback.

```bash
npm run build        # tsc -> dist/
npm start            # prestart runs build, then node dist/index.js
npm run dev          # node --watch src/index.ts (native type stripping)
npx tsc --noEmit     # typecheck only

npm run migrate:up   # apply pending migrations
npm run migrate:down # roll back the last one
npm run migrate -- create "add x" -j ts   # scaffold a new migration
```

The database runs from `docker-compose.yaml` in the repo root (`docker compose up -d`). Its
`env_file` points at `backend/.env`, so `POSTGRES_*` there creates the database and
`DATABASE_URL` is what the backend and the migration CLI connect with.

No test runner, linter, or formatter is configured. Don't reference `npm test` or `npm run lint` — they don't exist.

## Code style

Comment only what is not instantly readable from the code itself. No comments restating
what a line does, no section banners, no JSDoc on self-describing signatures. A comment
has to carry something the reader cannot see: a non-obvious external constraint, a
surprising reason, a bug it prevents. Default to none and let naming and types do the work.

**File order: exports first.** A file opens with what it exports — the class, then the
exported functions. Private helpers follow underneath, in roughly the order the exports
use them. A reader should see the public surface without scrolling.

**Use `private`, not `#`.** Class internals are marked with the TypeScript access
modifier. It is compile-time only, so it is a convention rather than runtime
enforcement — that is accepted. Parameter properties (`constructor(private x: T)`) are
still banned because type stripping cannot erase them; `erasableSyntaxOnly` enforces this.

**Small error classes live in the feature's `.model.ts` file**, not beside the code that throws them. A class that is a name, a message and two readonly fields is closer to a type than to logic, and keeping them together means one place to see what a feature can fail with.

**File names are kebab-case, with no dot-separated suffix.** Write `env-util.ts`, not
`env.util.ts`. Inside a feature or module folder the name is just the kind, because the
folder already says what it is about: `downloads/model.ts`, `downloads/controller.ts`,
`ytdlp/client.ts`, `ytdlp/fake.ts` — never `ytdlp/ytdlp-client.ts`. The recurring kinds are
`model`, `controller`, `route`, `client` and `fake`.

**Build the default case, not every case.** Handle what will actually happen; leave out
speculative options, formats and error branches nobody has asked for.

**Ask when unsure.** If a choice would change the shape of the result and the answer is not
in the code, the conventions or the request, ask instead of picking a default and moving on.
This applies to genuinely open decisions, not to routine judgement calls that are easy to
reverse.

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

Beyond `strict`, the config enables `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noImplicitOverride`, `noUnusedLocals`, and `noUnusedParameters`, plus `erasableSyntaxOnly`, which rejects any syntax Node's type stripping cannot erase (enums, namespaces, parameter properties). Prefix intentionally-unused parameters with `_` (e.g. `(_req: Request, res: Response)`).

## Backend structure

Feature folders. Everything belonging to one feature lives in one directory. There is no
layered split across the codebase and no ports-and-adapters indirection.

```
backend/src/
├── features/                     # one per feature, may import modules/ and utils/
│   ├── shared/
│   │   ├── model.ts              # Track, BadRequestError — what crosses features
│   │   └── request-util.ts       # requireQueryParam / requirePathParam
│   ├── auth/
│   │   ├── middleware.ts         # requireBearer: verifies the JWT, loads the user
│   │   ├── controller.ts         # the Spotify OAuth dance, issues our JWT
│   │   ├── model.ts
│   │   └── route.ts
│   ├── users/
│   │   ├── model.ts              # User, UserWithRole, UserRow, Role
│   │   ├── controller.ts         # role derivation and the admin operations
│   │   ├── database.ts           # the SQL for the users table
│   │   └── route.ts              # admin-only, whole router behind requireAdmin
│   ├── downloads/
│   │   ├── model.ts              # types and commands for this feature
│   │   ├── controller.ts         # the feature logic, exported as plain functions
│   │   └── route.ts              # an express Router, exported as the default export
│   └── sync/                     # the queue: one sync at a time, N parallel downloads
│       ├── model.ts
│       ├── controller.ts
│       └── route.ts
├── modules/                      # one per external integration, may import utils/
│   ├── postgres/
│   │   ├── client.ts             # the pg Pool plus query/queryOne helpers
│   │   └── migrate.ts            # runs pending migrations at boot
│   ├── spotify/
│   │   ├── client.ts             # OAuth token exchange, refresh, /v1/me
│   │   └── model.ts
│   └── ytdlp/
│       ├── model.ts              # types and errors of the yt-dlp integration
│       ├── client.ts             # drives the yt-dlp binary
│       └── fake.ts               # stand-in CLI runner for tests
├── utils/                        # small generic helpers, imports nothing of ours
│   ├── cli-model.ts
│   ├── cli-runner.ts             # spawn a binary, stream stdout lines, handle abort/timeout
│   └── env-util.ts
├── app.ts
└── index.ts

backend/migrations/                   # node-pg-migrate, outside src/ so tsc ignores it
└── <timestamp>_create-users-table.ts
```

### File kinds inside a feature

| Suffix | Holds |
|---|---|
| `controller.ts` | the feature logic — the brain of the feature |
| `route.ts` | an express Router: endpoint definitions, input parsing, error-to-status mapping |
| `model.ts` | types, commands, data models and small error classes, including the response shapes |
| `client.ts` | talks to an external process or API |
| `database.ts` | this feature's SQL and the functions that run it |
| `middleware.ts` | express middleware |
| `fake.ts` | a test double for one of the above |

HTTP surface so far:

| Route | Behaviour |
|---|---|
| `GET /api/auth/spotify` | 302 to Spotify's consent screen with a one-time `state` |
| `GET /api/auth/spotify/callback` | exchanges the code, upserts the user, 302s to `FRONTEND_URL?token=<jwt>` |
| `POST /api/sync` | 202 + `{syncId}`, or 409 if a sync is already running, or 409 if the account has no Spotify link |
| `GET /api/sync` | state, totals, the active downloads with live percent, and failures |
| `POST /api/sync/cancel` | 202, aborts in-flight downloads; 409 if nothing is running |
| `GET /api/users/me` | the caller's own `id`, `email`, `spotifyUserId`, `role`, `createdAt` — any authenticated user |
| `GET /api/users` | **admin** — every user with their derived role |
| `DELETE /api/users/:id` | **admin** — 204, or 404 if unknown |
| `PATCH /api/users/:id/library-directory` | **admin** — `{libraryDirectory}`, string or null; 409 if taken |
| `GET /api/downloads/:trackId/progress` | live progress for one track, 404 when idle |

**Login is Spotify OAuth 2.0, authorization-code with a client secret** (not PKCE — the
backend is a confidential client). `GET /api/auth/spotify` stores a one-time `state` in
memory with a 10-minute TTL and redirects; the callback verifies the state, exchanges the
code, reads `/v1/me`, upserts the user keyed on `spotify_user_id`, creates
`LIBRARY_ROOT/<spotifyUserId>`, and redirects to `FRONTEND_URL` with our own JWT in
`?token=`. A re-login updates the access token and keeps the stored refresh token when
Spotify omits one.

**`/api/auth/*` is the only unauthenticated prefix. Everything else is behind
`requireBearer`. `/api/users` applies `requireAdmin` with `router.use(...)`, which guards
every route registered *after* it — `GET /me` sits above that line deliberately and is the
one route there open to any authenticated user. Add new admin routes below it. Non-admins
get 403, anonymous callers 401.** User queries select an explicit readable-field
list rather than `SELECT *`, so the stored Spotify tokens never reach a response. `app.ts` mounts it ahead of each router, so
a handler can call `currentUser(res)` and get a `User`. The token is an HS256 JWT signed with
`JWT_SECRET` with a 7-day lifetime; `sub` is the user's UUID, which is looked up in the
database on every request, so a deleted user loses access immediately rather than at token
expiry.

Downloads cannot be started individually — a sync is the only trigger, so everything goes
through the queue and respects `MAX_PARALLEL_DOWNLOADS`. `listTracksToSync()` in
`features/sync/controller.ts` is still a stub standing in for the Spotify integration.

### Rules

1. **A feature owns its types.** They live in its `model.ts`. The exception is
   `features/shared/`, for what genuinely crosses features — `Track` and `BadRequestError`
   in its `model.ts`, request helpers in `request-util.ts`. A helper that throws one of our
   errors belongs here rather than in `utils/`, which may not import from `features/`.
   Something used by one feature only never goes here.
2. **Imports flow one way: `features/` → `modules/` → `utils/`.** A module never imports a
   feature, and `utils/` imports neither. A module owns the types of its own integration, so
   a feature using it imports them from there instead of redeclaring them. Anything in
   `utils/` should make sense in a different project — `cli-runner.ts` knows how to run a
   binary and nothing about yt-dlp.
3. **Cross-feature access goes through the other feature's controller**, never its client,
   model or internal helpers.
4. **Routers are module-level, not factories.** `route.ts` does `const router = Router()`,
   declares paths relative to its mount point (`/`, `/:trackId/progress`), registers an
   error handler with `router.use(...)` last, and `export default router`. The base path
   lives once in `app.ts`: `app.use('/api/downloads', downloadRouter)`. Nothing is passed in.
5. **No classes for logic — export functions.** A controller exports plain async functions
   and constructs what it needs at module level, asserting its env at the top of the file.
   Classes are for things that own mutable state, such as `YtDlpAudioDownloader` and its
   progress map.
6. **SQL lives in the feature's `database.ts`**, as named query constants plus the functions
   that run them, mapping the snake_case row to the camelCase model. Schema changes never go
   there — they are **node-pg-migrate** migrations in `backend/migrations/`, written in
   TypeScript with an `up`/`down` pair. `index.ts` runs pending migrations on every boot
   before anything else starts, so a fresh database needs no manual step and a failed
   migration stops the server rather than leaving it half-configured. `node-pg-migrate` is
   therefore a runtime **dependency**, not a devDependency — it has to exist wherever the
   app runs.
7. **Interfaces only where a seam is needed.** `CliRunner` exists so `ytdlp.fake.ts` can
   replace a real process. Do not add an interface per class out of habit.

### Environment variables

Every variable is asserted in **`index.ts` and nowhere else**: a `requireEnv('NAME')` per
variable from `utils/env-util.ts`, then `await import('./app.js')` to reach the rest of the
app. That dynamic import is load-bearing — a static one would evaluate `app.ts` and every
controller module body *before* any statement in `index.ts`, so the assertions would run
after those modules had already read `process.env`. Everywhere else simply reads
`process.env.NAME!` at the point of use.

`.env.example` documents every variable. Required ones carry a `# REQUIRED` line above the
description; optional ones carry no marker — absence is the signal, so never add
`# OPTIONAL`. A variable that needs more than presence (`MAX_PARALLEL_DOWNLOADS` must be a
positive integer) is parsed where it is used, and that parse throws at import time too.

### TypeScript specifics

- Interfaces are erased at runtime, so there is no DI container. Wire dependencies by hand in
  `index.ts` and pass them as constructor arguments.
- Relative imports need the `.js` extension (see Toolchain constraints), which bites often
  when moving files between features.
