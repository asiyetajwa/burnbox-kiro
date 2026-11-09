# Design: live inference with provider-neutral labels

## Changes
- `server/src/verdict.ts`: `Verdict.source` becomes `'model' | 'rules'`. `withModel` sets `'model'` on success. New exported `verdictBy(v)` returns `Burn Box rules` for rules verdicts, else `<Provider> (<model>)`; provider is `Gemini` when the base URL host is `generativelanguage.googleapis.com`, otherwise `Model`. Error messages drop the vendor name.
- `server/src/runs.ts`: both receipt builders use `verdictBy(verdict)`.
- `server/src/index.ts`: health `inference` is `'stub'` or `config.llm.model || 'auto'`; startup log likewise.
- `server/src/config.ts`: base URL trailing slash is stripped because paths are appended (`/chat/completions`, `/models`). Env var names unchanged.
- `web/app.js`: header shows the inference value from health instead of testing for `'vultr'`.
- `.env.example`, `docker-compose.yml`: Gemini base URL and `VULTR_MODEL=gemini-3.5-flash-lite` defaults.

## Unchanged
Floor logic (`floorOf`, `emailFloor`), `RANK`-based "raise never lower" merge, fallback-to-rules on error, prompt, and the key being read only in `config.ts`.

## Testing
`npm run check` for types; existing unit tests cover the rules path (`source === 'rules'`). The live path is verified only by the PENDING acceptance test.
