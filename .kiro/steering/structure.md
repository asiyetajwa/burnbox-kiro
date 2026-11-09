# Burn Box: repo layout

- `server/src/` config.ts (env), index.ts (HTTP API, static web), mail.ts (inbound SMTP), receipt.ts (Ed25519 receipts), runs.ts (run orchestration), sandbox.ts (Docker box control), verdict.ts (facts, rules floor, model call).
- `server/test/` node:test files for receipts and verdicts.
- `sandbox/box` file detonation image; `sandbox/browser` link detonation image; `sandbox/lab` demo phishing lab and egress gate.
- `web/` index.html and app.js.
- `samples/` harmless test samples (benign, invoice email, invoice script, demo email generator).
- `docs/SUBMISSION.md` template from the original repo, to be rewritten later.
- `Dockerfile`, `docker-compose.yml`, `.env.example`, `package.json`, `tsconfig.json`.
- `.kiro/steering/` project guidance; `.kiro/specs/` feature specs (currently `live-inference`).
