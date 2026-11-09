# Requirements: link quick check

A small, link-only view for the question "is this link safe?". It reuses the existing link run. It adds no data model, no auth and no infrastructure.

## User story

As a non-technical staff member, I want to paste one link and get a short verdict, so that I can decide whether to click it without learning the full Burn Box screens.

## Requirements

### R1. A quick view at `#quick`
1. Opening the app at `#quick` shows a view with one link input, one button, and nothing else for intake. No file picker, no email address, no samples.
2. The button stays off until the input holds a full `http://` or `https://` link.
3. Pressing Enter in the input does the same as the button.
4. The view works from the `#quick` hash at load and when the hash changes later.

### R2. The quick view reuses the existing link run
1. The view sends `POST /api/runs` with `{ url, via: 'quick' }`. No new endpoint is added.
2. When a team is joined in this browser, the view sends the `x-team-code` header, as the main view does.
3. Errors from the server (bad link, rate limit, unknown team) are shown as plain text in the view.

### R3. The `via` field gains `'quick'`
1. `via` becomes `'web' | 'email' | 'quick'` on the server (`Run`, `createRun` options) and on the client.
2. The server accepts `via: 'quick'` from a link request and records it. Any other `via` value in a request is ignored and the run is tagged `'web'`. A client cannot claim `'email'`.
3. A link run created with `via: 'quick'` keeps that tag through `createRun`, the saved run file, run detail, and the list summary.
4. Runs with no `via` behave as before (`'web'`).

### R4. Verdict card only
1. While the run is going, the view shows a short plain-English waiting line.
2. When the run is done, the view shows a card with: the verdict headline, the summary, the reasons, and a link to download the signed receipt.
3. The card also holds a link to the full run detail at `#BBX-####`.
4. The card text is escaped. Nothing from the link or the model is inserted as HTML.
5. If the run ends in error, the view shows the run's error text and offers to try again. It shows no verdict.

### R5. Quick runs are normal runs
1. A quick-check run appears in history: in the team list when a team code is set, otherwise in the public recent list.
2. A quick-check run produces the same signed receipt as any other link run. Receipt fields and signing are unchanged.
3. The verdict is written by the same path: the rules floor is the minimum and the model can only raise it. If the model errors, the rules verdict stands.
4. The existing per-IP limit (30 runs per hour) applies unchanged. No new limit, no bypass.

### R6. Boundaries
1. No new auth, accounts or tokens.
2. No new data files or fields other than the extra allowed value of `via`.
3. Plain English, short sentences, no em dashes, in all new text.
4. No claim of live inference is made by this feature. What the card says comes from the verdict as written.

## Out of scope
Receipt verification, host deployment, file or email quick checks, a separate quick-check history.
