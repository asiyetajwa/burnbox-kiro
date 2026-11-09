# Tasks: live inference

Status key: [x] done, [ ] pending.

- [x] 1. Change `Verdict.source` to `'model' | 'rules'` in verdict.ts (R1)
- [x] 2. Add `verdictBy()` and use it in both receipt builders in runs.ts (R3)
- [x] 3. Health and startup log report the model name instead of `vultr` (R2)
- [x] 4. Remove vendor names from inference error/log messages; strip trailing slash from base URL (R4)
- [x] 5. Update web header label, `.env.example` and `docker-compose.yml` defaults for Gemini (R4)
- [x] 6. Verify `npm run check` (tsc --noEmit) passes
- [x] 7. Validate ported docker-compose.yml parses
- [ ] 8. PENDING, acceptance on the host (not run in session 1; no host access):
  - [ ] 8.1 `GET /api/health` no longer reports `stub`
  - [ ] 8.2 Run benign file sample: verdict correct (safe)
  - [ ] 8.3 Run invoice email end to end (samples/invoice_overdue.eml): verdict correct
  - [ ] 8.4 Run one link: verdict correct
  - [ ] 8.5 At least one receipt names the model in `verdictBy`
