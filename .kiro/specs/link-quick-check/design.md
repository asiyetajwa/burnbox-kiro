# Design: link quick check

## Overview
The quick view is a client-side view in the existing single page app. It posts to the existing link endpoint, follows the run to the end, and draws a small verdict card. The server change is only a wider `via` type and one line to read it from the request.

## Server

### Types (`server/src/runs.ts`)
- Export `type Via = 'web' | 'email' | 'quick'`.
- `Run.via?: Via` and `createRun` opts `via?: Via`. The default stays `'web'`. `mail.ts` already passes `'email'`.

### API (`server/src/index.ts`)
- In the `{ url }` branch of `POST /api/runs`, read `via` from the JSON body. If it is exactly `'quick'`, pass `via: 'quick'` to `createRun`. Otherwise pass nothing (default `'web'`). A client cannot set `'email'`.
- `publicRun` and `summary` already serialize `via`. No change.
- The rate limit check (`allowed(ip)`) runs before this branch and is unchanged.

## Client

### Markup (`web/index.html`)
A new `<main id="v-quick" hidden>` using existing classes. It holds a heading, a short line, the link input, a button, a status line, and a result card area (`#q-card`). It has no file, email or sample elements.

### Logic (`web/app.js`)
- `show()` includes `'quick'` in the view list.
- A `quick` handler:
  1. Validates the link with the same pattern as the main link input and toggles the button.
  2. On submit, posts `{ url, via: 'quick' }` with the `x-team-code` header when a team is joined. A "team not found" error drops the team, as the main view does.
  3. Polls `GET /api/runs/:id` every 2 seconds until the run is `done` or `error` (up to 3 minutes). Polling is used instead of the event stream because the view shows no live trace, so it needs no replay logic.
  4. Draws the card from `run.verdict` (`level`, `headline`, `summary`, `reasons`) with `esc()`, a receipt link to `/api/runs/:id/receipt`, and a link to `#BBX-####`.
  5. On `run.status === 'error'` it shows `run.error` and a try-again button.
- Routing: `#quick` is handled at load and on `hashchange`. The existing `#BBX-####` deep link code is unchanged, so the full run detail link works.

## Data
No new model. The only change is one more allowed value of an existing optional field. Old run files load as before.

## Correctness and safety
- Quick runs go through `createRun`, `execute`, `writeVerdict` and `signReceipt` unchanged. The receipt and verdict rules are the same as any link run.
- History: `listRuns(teamId)` filters on `teamId` and `parent` only, so quick runs show in the right list without a change.
- Whitelisting `via` on the server keeps the field honest without adding auth.

## Testing
- `server/test/quick.test.ts` starts the real server with a temp data folder (as `teams.test.ts` does) and checks that:
  - a link request with `via: 'quick'` returns 202 and `via: 'quick'`;
  - the run detail and the public list show `via: 'quick'`;
  - the same request with a team code shows the run in the team list and not in the public list;
  - a request with `via: 'email'` or an unknown value is tagged `'web'`;
  - a link request without `via` is tagged `'web'`;
  - the tag is in the saved run file.
- The test machine may have no Docker. The run then ends in error. The tag and the listing do not depend on that, so the tests still hold. A signed receipt needs a finished box, so receipt production is not tested here and is left as a manual check.
- `npm run check` and `npm test` must pass.
