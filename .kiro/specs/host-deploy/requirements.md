# Requirements: host deploy (burnbox-kiro onto the demo host)

## Introduction
Put this exact tree (burnbox-kiro, sessions 1 to 4) on the demo host at 136.109.165.109 in place of the old Burn Box stack, without losing the receipt signing key or any history. This spec is a runbook, not a feature. It changes no server code. The deployer (MZA or Brian) runs it on the host. Nothing in this spec has been run yet: every task is PENDING.

## Findings that shape the requirements (checked in the repo)
- The old stack lives in `/opt/burnbox` (repo asiyetajwa/burnbox). The old `deploy/setup-vultr.sh` clones that repo and must not be reused.
- `docker-compose.yml` declares one volume, `burnbox-data`, mounted at `/app/data`. It holds `data/keys/receipt-ed25519.pem` (the Ed25519 signing key), `data/runs/` (run history) and `data/teams.json` (teams).
- Compose prefixes volume names with the project name, which defaults to the checkout directory name. The current volume is therefore `burnbox_burnbox-data`. A checkout at `/opt/burnbox-kiro` would create `burnbox-kiro_burnbox-data`: a new, empty volume, a new signing key, and every earlier receipt unverifiable.
- A second trap: `docker run -v burnbox-data:/data ...` (the short name) does not touch the real volume. Docker creates a new empty volume called `burnbox-data`. Every command must use the full name `burnbox_burnbox-data`.
- A third trap: the project name also follows the directory of whatever checkout you run Compose from. A rollback run from a renamed directory would pick yet another project name. Always pass `-p burnbox`.
- `server/src/receipt.ts` signs new receipts over `canonical()`, which skips `undefined` members. `verifyReceipt()` falls back to `legacyCanonical()` for older file and link receipts signed with `parent: undefined`. Old receipts verify as long as the same private key is in use.
- `GET /api/health` returns `{ ok, sandbox: { docker, box, browser, runtime }, inference, forwardTo }`. `inference` is `stub` when `STUB_LLM=1`, otherwise the model name.
- The host pulls the code from GitHub. The commit under deploy must already be on `asiyetajwa/burnbox-kiro` `main`. This session does not push.

## Requirements

### R1. Checkout and project name
- 1.1 The new checkout lives at `/opt/burnbox`, the same path as the old stack. The old checkout is moved aside whole to `/opt/burnbox.bak-<stamp>`, never deleted.
- 1.2 The Compose project name is `burnbox`. `.env` carries `COMPOSE_PROJECT_NAME=burnbox` as a guard, and every Compose command in this runbook passes `-p burnbox`.
- 1.3 `docker compose -p burnbox config --volumes` prints `burnbox-data`, and `docker volume ls` shows `burnbox_burnbox-data` before and after, with the same `CreatedAt`.
- 1.4 The deploy script is `deploy/setup-gcp.sh`. It clones `asiyetajwa/burnbox-kiro`, never `asiyetajwa/burnbox`.

### R2. Host `.env`
- 2.1 Values: `VULTR_INFERENCE_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/`, `VULTR_MODEL=gemini-3.5-flash-lite`, `STUB_LLM=0`, `SANDBOX_RUNTIME=runsc`, `PUBLIC_PORT=80`, `RUNS_PER_HOUR=30`, `MAX_CONCURRENT_RUNS=2`, `MAIL_DOMAIN=burnbox.dribble360.com`.
- 2.2 `VULTR_INFERENCE_API_KEY` is the Gemini key, typed on the host by the deployer. It is never written to the repo, this spec, the script, a log or a chat. The old Vultr key is not reused.
- 2.3 Before anything changes, the current `/opt/burnbox/.env` is copied to `/opt/burnbox/.env.bak-<stamp>` (travels with the old checkout to `/opt/burnbox.bak-<stamp>/`) and to `/var/backups/burnbox/env-<stamp>` (mode 600).
- 2.4 The script never overwrites an existing `.env` and refuses to start the stack while the key line is empty or `STUB_LLM=1`.

### R3. Volume preservation (critical)
- 3.1 The volume `burnbox_burnbox-data` is never recreated, removed or pruned. Forbidden: `docker compose down -v`, `docker volume rm`, `docker volume prune`, `docker system prune --volumes`.
- 3.2 Before the deploy the volume is inspected and backed up to `/var/backups/burnbox/burnbox-data-<stamp>.tar.gz` (mode 600; it contains the private signing key, so it never goes into the repo or a shared drive). A copy off the host is recommended.
- 3.3 After the deploy the volume is inspected again. Name and `CreatedAt` must match the "before" record.
- 3.4 If the volume is missing, the script stops unless `FIRST_INSTALL=1` is set.

### R4. Restart and health
- 4.1 Box images are rebuilt only if `sandbox/` changed. The app is started with `docker compose -p burnbox up -d --build`.
- 4.2 `GET http://136.109.165.109/api/health` shows `ok: true`, `sandbox.docker`, `sandbox.box` and `sandbox.browser` all true, `sandbox.runtime` `runsc`, and `inference` equal to `gemini-3.5-flash-lite` (not `stub`).
- 4.3 `GET http://136.109.165.109/` returns 200.

### R5. Acceptance test (in order)
- 5.1 Old-receipt capture: before the redeploy, at least one real receipt issued by the current host is downloaded and saved.
- 5.2 Live inference (live-inference tasks 8.1 to 8.5): health not stub; benign file sample correct (safe); invoice email end to end correct; one link correct; at least one receipt has `verdictBy` "Gemini (gemini-3.5-flash-lite)".
- 5.3 Session 2 to 4 manual checks: create a team, join by code, run from the team view and see it in team history; run a `#quick` link check and see it tagged "via quick" in history; download a real receipt and verify it on `#verify` with both the server check and the browser check.
- 5.4 Old-receipt regression: after the redeploy, the receipt saved in 5.1 verifies on `#verify` (server and browser). This is the proof the signing key survived.
- 5.5 A task is marked done only after it was actually run. Unrun checks stay PENDING.

### R6. Rollback
- 6.1 If health or any acceptance check fails, the old checkout and the backed-up `.env` are restored, the old stack is brought up with `-p burnbox`, and health is checked again.
- 6.2 The rollback preserves `burnbox_burnbox-data`. It never uses `-v`.
- 6.3 The volume tarball is restored only if the volume itself is damaged, and only with the app stopped.

### R7. Out of scope
- 7.1 No DNS or MX changes. DNS and MX for burnbox.dribble360.com wait on the owner's Cloudflare sign-in. Forwarded-email intake waits on that. UFW leaves port 25 closed until then.
- 7.2 No submission, no payments, no GitHub push, no film.
