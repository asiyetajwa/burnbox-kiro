# Requirements: verdict history and team workspace

## Introduction
Today every run lands on one public "recent" list. Small teams want a shared history of their own checks. This feature adds shared team views: a team has a secret code, and anyone who enters the code in their browser sees that team's runs. There are no accounts and no passwords. The UI must say this plainly.

## Decisions
- D1: A team view is additive. Runs with no team stay on the public recent list exactly as before.
- D2: Runs that belong to a team are shown in that team's view and are kept off the public recent list. A shared view that is also public would not be shared with anyone in particular.
- D3: A team code is the only secret. It is shown once, at creation. Anyone holding the code can see the team's runs and add runs to it. The code cannot be changed or revoked in this version.
- D4: Opening a single run by its number (`/api/runs/BBX-####`, `#BBX-####` deep links) is unchanged. The run number is not a secret, so a team run can still be opened by someone who knows its number. The UI says so.
- D5: `via` stays `'web' | 'email'`. Email runs forwarded by SMTP are team-less.

## Requirements

### R1: Team model
- A Team SHALL be `{ id, name, code, createdAt }`.
- Teams SHALL be stored in `data/teams.json`, loaded on boot and saved on every change.
- `code` SHALL be generated from at least 128 bits of randomness.
- `name` SHALL be trimmed, 1 to 60 characters.

### R2: Create a team
- WHEN `POST /api/teams` is called with `{ name }` THEN the server SHALL return 201 with the team including its `code`.
- WHEN `name` is missing or empty or too long THEN the server SHALL return 400.
- The code SHALL NOT be returned by any other route.
- Team creation SHALL be rate limited per address.

### R3: Join a team
- WHEN `POST /api/teams/join` is called with `{ code }` and the code is known THEN the server SHALL return `{ id, name, createdAt }` without the code.
- WHEN the code is unknown or malformed THEN the server SHALL return 400.

### R4: Team run list
- WHEN `GET /api/runs?team=<code>` is called with a known code THEN the server SHALL return that team's top-level runs, newest first, capped at 50.
- WHEN the code is unknown THEN the server SHALL return 400.
- WHEN `GET /api/runs` is called without `team` THEN the server SHALL return the public recent list: top-level runs with no team, newest first, capped at 50.

### R5: Create a run in a team
- WHEN a web run is created and the request carries an `x-team-code` header with a known code THEN the run SHALL get that team's `teamId`.
- WHEN the header carries an unknown code THEN the server SHALL return 400 and SHALL NOT create a run.
- WHEN no header is sent THEN the run SHALL have no `teamId`.
- Child runs of an email SHALL inherit the parent's `teamId`.
- Email runs from the SMTP intake SHALL have no `teamId`.

### R6: Frontend
- The page SHALL offer: create a team, join by code, leave a team. The joined code SHALL be kept in `localStorage`.
- WHEN a team is joined THEN new web runs SHALL be sent with the code, and the Past Runs view SHALL show the team's runs.
- WHEN no team is joined THEN Past Runs SHALL show the public recent list.
- The team history SHALL be filterable by verdict level (safe, suspicious, malicious), kind (file, link, email) and date.
- Rows SHALL open the existing run detail view, and `#BBX-####` deep links SHALL keep working.
- WHEN the stored code is no longer known to the server THEN the UI SHALL drop it and say so.
- The UI SHALL describe teams as shared views, not accounts, and SHALL say that anyone with the code can see the team's runs.
- The code SHALL be shown once on creation, with a copy button and a warning to save it.

### R7: Unchanged
- The verdict rules floor, the raise-never-lower rule and receipt signing SHALL NOT change.
- The link quick check and receipt verification features SHALL NOT change.

### R8: Tests
- Tests SHALL cover team creation, a bad join code rejected, runs filtered by team, and team-less runs still on the public list. Existing tests SHALL keep passing.

### R9: Acceptance (live)
- Detonating a real run into a team from a browser and seeing it in the team view. Status: PENDING (needs the sandbox host and a browser; not run in this session).
