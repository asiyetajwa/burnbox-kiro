# Design: verdict history and team workspace

## Server
- New `server/src/teams.ts`: `Team` type, `loadTeams()`, `createTeam(name)`, `teamByCode(code)`, `publicTeam(t)`. Teams live in a `Map` keyed by id, with a lookup by code. The file path is `join(config.dataDir, 'teams.json')`, resolved when used. Saves write a temp file and rename it. Codes come from `crypto.randomBytes(24)` as base64url (192 bits). Lookup scans for a constant-time match on the code with `timingSafeEqual`.
- `server/src/runs.ts`: `Run` gains `teamId?: string`. `createRun` takes `opts.teamId`. `finishEmail` passes the parent's `teamId` to child runs. `listRuns(teamId?)` returns top-level runs; with a team id only that team's runs, without one only runs that have no `teamId`.
- `server/src/index.ts`:
  - `POST /api/teams` (rate limited, 10 per hour per address), `POST /api/teams/join`.
  - `GET /api/runs` reads `?team=`. Known code gives team runs; unknown gives 400; absent gives the public list.
  - `POST /api/runs` reads `x-team-code`. It is checked before the body is read or the run is created. Unknown gives 400.
  - `summary()` and `publicRun()` do not expose the team id or code.
- `server/src/mail.ts` is untouched, so forwarded emails stay team-less.

## Frontend
- `web/index.html`: a small "Team" panel at the top of Past Runs and a compact team chip in the header bar. The panel has create, join and leave controls, an honest note, and a filter row (level, kind, date). The creation result shows the code once.
- `web/app.js`: `team` state from `localStorage['bb-team']` (`{ code, name }`). `api()` calls for `start()` add the `x-team-code` header when joined. `loadPast()` fetches `/api/runs?team=<code>` when joined, else `/api/runs`. Filters apply in the browser to the loaded list (at most 50 rows). Date filter is a single day compared on the UTC date of `createdAt`. On a 400 for a stored code, the code is dropped and the UI says the team was not found.
- Existing deep links (`#BBX-####`, `#replay-BBX-####`) and the row click handler are reused.

## Why filters run in the browser
The list is capped at 50 rows, so server-side filtering adds routes and edge cases without saving work. The cap applies before filtering, which is stated in the UI note.

## Honesty
The UI calls this a shared team view, not an account. Anyone with the code sees the team's runs and can add runs. A run's number still opens it for anyone who knows the number (D4).

## Unchanged
`verdict.ts`, `receipt.ts`, `sandbox.ts`, the link quick check and receipt verification.

## Testing
`server/test/teams.test.ts` starts the real server as a child process on a free port with a temp `DATA_DIR` seeded with run and team files, `STUB_LLM=1`, and no mail domain. It covers team creation, bad join code, team filter, public list, bad code on run creation, and persistence across a restart. Runs that need Docker are not created in tests.
