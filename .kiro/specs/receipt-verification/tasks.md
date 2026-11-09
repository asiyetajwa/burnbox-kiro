# Tasks: receipt verification page

Status key: [x] done, [ ] pending.

- [x] 1. Fix `canonical()` to skip undefined members and add the legacy retry in `verifyReceipt()` (R6)
- [x] 2. Extend `server/test/receipt.test.ts` for round trip, legacy receipt and tampering (R6)
- [x] 3. Add the `#v-verify` view and the link from New Run to `web/index.html` (R1, R2, R7)
- [x] 4. Add `#verify` routing, input handling, `/api/verify` call and details to `web/app.js` (R1 to R4, R7, R8)
- [x] 5. Add the browser signature check with `/api/pubkey` and WebCrypto, with graceful fallback (R5) (logic exercised in Node WebCrypto; not yet in a real browser, see 9.3)
- [x] 6. Add `server/test/verify.test.ts` for the endpoint flow, pubkey agreement and detail fields (R3, R4, R6)
- [x] 7. Run `npm run check` and make it pass
- [x] 8. Run `npm test` and make it pass
- [ ] 9. PENDING, manual acceptance (needs a browser and a finished run; not part of this session):
  - [ ] 9.1 Download a receipt from a real file run, upload it at `#verify`, see VALID and the details
  - [ ] 9.2 Change one letter in the verdict, see INVALID
  - [ ] 9.3 Browser check shows "Your browser says" valid; on a browser without Ed25519 it says not available
  - [ ] 9.4 Reload on `#verify` and open it from the New Run link
  - [ ] 9.5 Receipts made before this change still show VALID on the host
