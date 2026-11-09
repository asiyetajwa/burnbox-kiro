# Tasks: link quick check

Status key: [x] done, [ ] pending.

- [x] 1. Add `Via` type with `'quick'` in runs.ts and use it in `Run` and `createRun` (R3)
- [x] 2. Read `via: 'quick'` from the link request in index.ts, ignore any other value (R2, R3)
- [x] 3. Add the `#v-quick` view to index.html (R1, R4)
- [x] 4. Add the quick view logic and `#quick` routing to app.js, including the `'quick'` via value on the client (R1, R2, R4)
- [x] 5. Add `server/test/quick.test.ts` for the tagging, listing and whitelist (R3, R5)
- [x] 6. Run `npm run check` and make it pass
- [x] 7. Run `npm test` and make it pass
- [ ] 8. PENDING, manual acceptance (needs a browser and a working box; not run in this session unless stated):
  - [ ] 8.1 Open `#quick`, paste a link, see the verdict card
  - [ ] 8.2 The card links to `#BBX-####` and downloads a signed receipt
  - [ ] 8.3 The run shows in Past Runs, in the team list when a team is joined
