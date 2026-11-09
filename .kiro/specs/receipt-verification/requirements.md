# Requirements: receipt verification page

## Introduction
Every finished run produces a signed receipt (Ed25519). Today the only way to check one is to call `POST /api/verify` by hand. This feature adds a public `#verify` view where anyone can paste or upload a receipt and see, in plain English, whether it is genuine. No accounts, no new infrastructure.

## Findings that shape the requirements (checked in the repo)
- A receipt is `{ body, signature, algorithm: 'ed25519' }`. The signature covers `canonical(body)`.
- Run id is `body.run`. Other fields: `verdict`, `verdictBy`, `destroyedAt`, `destroyed`. `boxesBurned` exists only on email receipts. File and link receipts have one box.
- Bug: file and link receipts are signed with `parent: undefined` in the body. `canonical()` writes that as the text `"parent":undefined`, but the downloaded JSON has no `parent` key, so a downloaded file or link receipt does not verify. The page would show INVALID for real receipts. R6 fixes this without breaking old receipts.

## Requirements

### R1. A public verify view
As anyone with a receipt, I want a page to check it, so I do not need to trust the person who sent it.
- 1.1 `#verify` shows a view with a text area and a file chooser. It needs no login and no team code.
- 1.2 The main page links to `#verify`.
- 1.3 Opening `#verify` directly (or reloading on it) shows the view.

### R2. Input
- 2.1 I can paste receipt JSON into the text area.
- 2.2 I can choose a `.json` file. Its text fills the text area. Files over 64 KB are refused with a plain message.
- 2.3 The Check button is off while the text area is empty.
- 2.4 Text that is not valid JSON, or not shaped like a receipt, gets a plain message and no VALID or INVALID answer.

### R3. Server check
- 3.1 The page sends the receipt to `POST /api/verify` and shows the answer.
- 3.2 `valid: true` shows VALID. `valid: false` shows INVALID, with a short plain reason ("The signature does not match this receipt, so it was changed or did not come from this Burn Box").
- 3.3 A server or network error shows an error message, never VALID.

### R4. Receipt details
- 4.1 The page shows run id, verdict, who wrote the verdict (`verdictBy`), when the box was destroyed (`destroyedAt`), and boxes burned.
- 4.2 Boxes burned is `boxesBurned` when present, otherwise 1 when `destroyed` is true, otherwise 0.
- 4.3 Details come only from the signed `body`. Anything outside `body` is ignored.
- 4.4 For INVALID receipts the details are shown under a "not trusted" label. Missing fields show "not in this receipt".
- 4.5 All receipt text is escaped before it is put on the page.

### R5. Browser check (second check)
- 5.1 The page fetches `GET /api/pubkey` and checks the signature in the browser with WebCrypto.
- 5.2 The page shows the two checks separately: "This server says" and "Your browser says".
- 5.3 If the browser lacks Ed25519 support, or the key fetch fails, it says the browser check was not available. This never changes the server answer.
- 5.4 If the two checks disagree, the page says so and does not show a plain VALID.

### R6. Downloaded receipts must verify
- 6.1 A receipt written by `signReceipt` and downloaded as JSON verifies (round trip through JSON).
- 6.2 Receipts signed before this change still verify, including old file and link receipts that were signed with `parent: undefined`.
- 6.3 The signing scheme (Ed25519 over canonical JSON), the receipt format and the two endpoints keep their shape. `/api/verify` still returns `{ valid }`.
- 6.4 A changed body or signature never verifies.

### R7. Plain language and accessibility
- 7.1 On-screen text is short plain sentences with no em dashes.
- 7.2 The answer is in an element with `role="status"` and `aria-live="polite"`. VALID and INVALID are shown by words, not by color alone.

### R8. Honesty
- 8.1 The page says what a valid receipt proves: this Burn Box server signed these exact details. It does not say the file or link itself is safe.

## Out of scope
New auth, accounts, storage, endpoints, key changes, key rotation, receipt format changes, host deploy.
