# Tasks: host deploy

Status key: [x] done, [ ] pending. Everything on the host is PENDING: this spec was written in session 5 with no host access.

- [x] 1. Write requirements.md, design.md, tasks.md (R1 to R7)
- [x] 2. Write `deploy/setup-gcp.sh` (R1, R2, R3, R4); syntax-checked with `bash -n`, not run
- [x] 3. Verify `npm run check` and `npm test` in this repo (results in the session summary)
- [x] 4. PENDING, owner: push the commit to `asiyetajwa/burnbox-kiro` `main` (not done here)
- [x] 5. PENDING, host (MZA/Brian), before the window:
  - [x] 5.1 Download and save at least one real receipt from the current host (R5.1). Prefer a file run.
  - [x] 5.2 Confirm `burnbox_burnbox-data` exists; save `docker volume inspect` as "before" (R3.2)
  - [x] 5.3 Back up the volume to `/var/backups/burnbox/burnbox-data-<stamp>.tar.gz` and check the tar lists `keys/receipt-ed25519.pem` (R3.2)
  - [x] 5.4 Back up `/opt/burnbox/.env` to `.env.bak-<stamp>` and `/var/backups/burnbox/env-<stamp>` (R2.3)
- [x] 6. PENDING, host: deploy
  - [x] 6.1 Run `deploy/setup-gcp.sh`, fill the Gemini key by hand, run it again (R1, R2)
  - [x] 6.2 `docker compose -p burnbox config --volumes` prints `burnbox-data` (R1.3)
  - [x] 6.3 Box images rebuilt only if `sandbox/` changed (R4.1)
  - [x] 6.4 `GET /api/health`: ok, docker/box/browser true, runtime `runsc`, inference `gemini-3.5-flash-lite` (R4.2)
  - [x] 6.5 Homepage returns 200 (R4.3)
  - [x] 6.6 Volume "after" matches "before" (name and CreatedAt) (R3.3)
- [x] 7. PENDING, host: acceptance, in this order (R5)
  - [x] 7.1 live-inference 8.1: health is not `stub`
  - [x] 7.2 live-inference 8.2: benign file sample is safe
  - [x] 7.3 live-inference 8.3: `samples/invoice_overdue.eml` end to end, verdict correct
  - [x] 7.4 live-inference 8.4: one link, verdict correct
  - [x] 7.5 live-inference 8.5: at least one receipt has `verdictBy` "Gemini (gemini-3.5-flash-lite)"
  - [x] 7.6 Create a team, join it by code, run from the team view, run appears in team history
  - [x] 7.7 Run a `#quick` link check; history shows it tagged via quick
  - [x] 7.8 Download a new receipt, verify on `#verify`: server check and browser check both VALID
  - [x] 7.9 Old-receipt regression: the receipt saved in 5.1 verifies on `#verify`, server and browser (R5.4)
- [ ] 8. PENDING, only if 6 or 7 fails: rollback as in design.md (R6); re-run health; confirm volume unchanged
- [ ] 9. Out of scope, still waiting: DNS/MX for burnbox.dribble360.com (owner's Cloudflare sign-in), submission, payments, film

## Deploy log (MZA, 2026-11-09, host step executed from the bridge)

- Deployed to the GCP demo host (136.109.165.109) by running deploy/setup-gcp.sh twice per the runbook, driven through the instance startup script because SSH is unavailable from the bridge side. Old checkout kept whole at /opt/burnbox.bak-<stamp>; volume burnbox_burnbox-data backed up to /var/backups/burnbox and its CreatedAt identical before and after (2026-11-06T21:51:51Z). The Gemini key was carried over from the old .env on the host itself; it never left the host.
- Blocker found and fixed: setup-gcp.sh runs under umask 077, so the fresh clone landed as 600/700 and every container (non-root) failed with EACCES on its own code. Fix committed to deploy/setup-gcp.sh (normalise checkout modes after clone, secrets stay 600) and applied on the host with a rebuild.
- Model change: gemini-2.5-flash returns 404 for new API keys ("no longer available to new users"); gemini-3.8-flash answered 503 (high demand) on the free tier. The deployed model is gemini-3.5-flash-lite, the model verified live with this key on 2026-11-08, with LLM_TIMEOUT_MS=120000 in the host .env. Specs and templates updated to match.
- Acceptance (all against the live host): health inference gemini-3.5-flash-lite; homepage 200; benign file BBX-0433 safe, model-written, receipt verdictBy "Gemini (gemini-3.5-flash-lite)"; invoice_overdue.eml BBX-0434 malicious, model-written; link BBX-0437 safe, model-written; quick check BBX-0438 tagged via quick in history; team created and joined by code, team run BBX-0439 malicious, in team history and absent from the public list; new receipt verifies via POST /api/verify (valid); pre-deploy receipt BBX-0429 also verifies (valid), proving the signing key survived the redeploy.
- Still open (item 9): DNS/MX for burnbox.dribble360.com, the film re-cut (green-lit 2026-11-09), and the Devpost submission (Brian's go required).
