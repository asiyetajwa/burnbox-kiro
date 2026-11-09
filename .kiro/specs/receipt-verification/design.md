# Design: receipt verification page

## Overview
A new `#verify` view in the existing single page app, in the style of `#quick`. It posts the receipt to the existing `POST /api/verify`, then also checks the signature in the browser with the key from `GET /api/pubkey`. One small server fix makes downloaded file and link receipts verifiable (R6).

## Server

### The `parent: undefined` bug (`server/src/receipt.ts`)
`signReceipt` signs `canonical(body)`. For file and link runs `runs.ts` puts `parent: undefined` in the body. The old `canonical` turned that into `"parent":undefined`. `JSON.stringify` drops the key, so the downloaded receipt canonicalizes differently and fails. Confirmed by a quick script before writing this design.

Minimal, backwards-compatible fix:
- `canonical()` skips object members whose value is `undefined`, the same rule as `JSON.stringify`. New receipts are signed over bytes that survive a JSON round trip. Nothing else about the scheme changes.
- `verifyReceipt()` first checks `canonical(body)`. If that fails and the body has no `parent` key, it checks once more against the legacy bytes, which are `canonical` with `parent: undefined` written as the literal text (the only field that was ever undefined in a receipt body; email receipts have no `parent` key, and the legacy retry fails for them, harmlessly). A legacy canonical form is kept as a small internal function `legacyCanonical`.
- Receipts that already verified (email receipts, hand-built bodies) take the first path and are unchanged.
- The legacy retry cannot make a forged receipt pass: it still needs a valid Ed25519 signature over specific bytes made with the server key.

### Endpoints
No change. `POST /api/verify` returns `{ valid }` (400 with a plain message on bad input). `GET /api/pubkey` returns the PEM.

## Client

### Markup (`web/index.html`)
`<main id="v-verify" hidden>` using existing classes (`new`, `intake`, `v-card`, `receipt`, `btn`, `link-in`, `drop small`). Parts:
- heading, one-line explanation;
- `<textarea id="vf-text">` with a label, a file chooser (`#vf-file`, accept `.json,application/json`), Check button `#vf-go`, status line `#vf-status` (`role="status"`);
- result card `#vf-card`: a big word `#vf-word` (VALID or INVALID), a reason line, two lines for server and browser checks, a `<dl id="vf-dl">` of details, and a note about what a valid receipt proves.
- A link `<a href="#verify">Verify a receipt</a>` on the New Run view, under the side panel.

### Logic (`web/app.js`)
- `show()` view list gains `'verify'`.
- `route()` handles `#verify` (show, focus the text area). It already runs at load and on `hashchange`.
- `parseReceipt(text)`: `JSON.parse`; must be an object with an object `body`, a string `signature`, and `algorithm === 'ed25519'`. Otherwise a plain message.
- File chooser reads with `file.text()` (limit 64 KB) into the text area.
- Check: `POST /api/verify` with the text as sent. The result drives the word and reason.
- Browser check `browserVerify(receipt)`:
  1. fetch the PEM from `/api/pubkey`, strip the header lines, base64 decode to SPKI bytes;
  2. `crypto.subtle.importKey('spki', der, { name: 'Ed25519' }, false, ['verify'])`;
  3. `crypto.subtle.verify('Ed25519', key, sig, bytes)` over `canon(body)`, then over the legacy form if the body has no `parent`;
  4. returns `true`, `false`, or `null` when unsupported or failing to load.
  `canon` in the browser is the same rule as the server (sorted keys, undefined skipped). A small legacy flag writes `parent: undefined` as text for old receipts.
- Result logic: server true and browser true or null: VALID. Server false: INVALID. Server true and browser false (or the reverse): show "The two checks disagree. Do not trust this receipt." Server error: error message only.
- Details from `receipt.body` only: run (`body.run`), verdict, verdictBy, destroyedAt, boxes burned (`boxesBurned ?? (destroyed ? 1 : 0)`). Rendered with `esc()`.

### Wording
Short sentences, no em dashes. VALID note: "This Burn Box signed exactly these details. It does not tell you the file or link is safe. Read the verdict for that."

## Data
No new data, no storage. The pasted receipt is sent only to this server's `/api/verify`.

## Testing
- `server/test/receipt.test.ts` (extended):
  - a receipt with `parent: undefined` survives a JSON round trip and verifies;
  - a legacy receipt (signed over the old canonical bytes, built in the test with the same key) still verifies;
  - tampering still fails, including adding a `parent`.
- `server/test/verify.test.ts` (new): starts the real server on a free port with a temp data dir whose key was created by the test, then
  - signs file-style, link-style and email-style bodies, round trips them through JSON and POSTs to `/api/verify`: `{ valid: true }`;
  - changed verdict, changed signature, wrong shape: `valid: false` or 400, never `true`;
  - `GET /api/pubkey` returns a PEM, and a Node `crypto.verify` with that key over the canonical body agrees (this mirrors the browser check);
  - the detail fields the page reads (`run`, `verdict`, `verdictBy`, `destroyedAt`, boxes burned rule) are present in the verified body.
- Browser-only code (DOM, WebCrypto) has no test runner in this repo. It is checked by hand in the acceptance task, which is PENDING.
- `npm run check` and `npm test` must pass.
