# Tasks: host deploy

Status key: [x] done, [ ] pending. Everything on the host is PENDING: this spec was written in session 5 with no host access.

- [x] 1. Write requirements.md, design.md, tasks.md (R1 to R7)
- [x] 2. Write `deploy/setup-gcp.sh` (R1, R2, R3, R4); syntax-checked with `bash -n`, not run
- [x] 3. Verify `npm run check` and `npm test` in this repo (results in the session summary)
- [ ] 4. PENDING, owner: push the commit to `asiyetajwa/burnbox-kiro` `main` (not done here)
- [ ] 5. PENDING, host (MZA/Brian), before the window:
  - [ ] 5.1 Download and save at least one real receipt from the current host (R5.1). Prefer a file run.
  - [ ] 5.2 Confirm `burnbox_burnbox-data` exists; save `docker volume inspect` as "before" (R3.2)
  - [ ] 5.3 Back up the volume to `/var/backups/burnbox/burnbox-data-<stamp>.tar.gz` and check the tar lists `keys/receipt-ed25519.pem` (R3.2)
  - [ ] 5.4 Back up `/opt/burnbox/.env` to `.env.bak-<stamp>` and `/var/backups/burnbox/env-<stamp>` (R2.3)
- [ ] 6. PENDING, host: deploy
  - [ ] 6.1 Run `deploy/setup-gcp.sh`, fill the Gemini key by hand, run it again (R1, R2)
  - [ ] 6.2 `docker compose -p burnbox config --volumes` prints `burnbox-data` (R1.3)
  - [ ] 6.3 Box images rebuilt only if `sandbox/` changed (R4.1)
  - [ ] 6.4 `GET /api/health`: ok, docker/box/browser true, runtime `runsc`, inference `gemini-2.5-flash` (R4.2)
  - [ ] 6.5 Homepage returns 200 (R4.3)
  - [ ] 6.6 Volume "after" matches "before" (name and CreatedAt) (R3.3)
- [ ] 7. PENDING, host: acceptance, in this order (R5)
  - [ ] 7.1 live-inference 8.1: health is not `stub`
  - [ ] 7.2 live-inference 8.2: benign file sample is safe
  - [ ] 7.3 live-inference 8.3: `samples/invoice_overdue.eml` end to end, verdict correct
  - [ ] 7.4 live-inference 8.4: one link, verdict correct
  - [ ] 7.5 live-inference 8.5: at least one receipt has `verdictBy` "Gemini (gemini-2.5-flash)"
  - [ ] 7.6 Create a team, join it by code, run from the team view, run appears in team history
  - [ ] 7.7 Run a `#quick` link check; history shows it tagged via quick
  - [ ] 7.8 Download a new receipt, verify on `#verify`: server check and browser check both VALID
  - [ ] 7.9 Old-receipt regression: the receipt saved in 5.1 verifies on `#verify`, server and browser (R5.4)
- [ ] 8. PENDING, only if 6 or 7 fails: rollback as in design.md (R6); re-run health; confirm volume unchanged
- [ ] 9. Out of scope, still waiting: DNS/MX for burnbox.dribble360.com (owner's Cloudflare sign-in), submission, payments, film
