# Tasks: verdict history and team workspace

Status key: [x] done, [ ] pending.

- [x] 1. Write requirements.md, design.md, tasks.md for this spec
- [x] 2. Add `server/src/teams.ts`: Team model, `data/teams.json` load and save, code lookup (R1)
- [x] 3. Add `POST /api/teams` and `POST /api/teams/join` (R2, R3)
- [x] 4. `GET /api/runs?team=<code>`; public list holds team-less runs only; 50 cap kept (R4)
- [x] 5. `teamId` on runs; `x-team-code` header validated on run creation; children inherit; email intake stays team-less (R5)
- [x] 6. Frontend: team create, join, leave; code shown once; honest wording; localStorage (R6)
- [x] 7. Frontend: team history filters for verdict, kind and date; row click and `#BBX-####` links reuse the existing view (R6)
- [x] 8. Tests in `server/test/teams.test.ts` (R8)
- [x] 9. `npm run check` passes
- [x] 10. `npm test` passes (18 tests)
- [ ] 11. PENDING, acceptance in a browser on a host with the sandbox (R9; not run in this session):
  - [ ] 11.1 Create a team, copy the code, detonate a test sample, see it in the team view and not on the public list
  - [ ] 11.2 Join from a second browser with the code and see the same run
  - [ ] 11.3 Filters narrow by verdict, kind and date
