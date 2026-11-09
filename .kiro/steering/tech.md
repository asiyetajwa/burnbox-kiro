# Burn Box: tech

- Runtime: Node 22 (>=22.18), TypeScript run directly via type-stripping. No build step. `npm run check` is `tsc --noEmit`; `npm test` is `node --test server/test/*.test.ts`.
- Sandbox: Docker, one container per run, gVisor `runsc` via `SANDBOX_RUNTIME` when installed. The app reaches Docker only through a restricted docker-socket-proxy.
- Inference: Gemini through an OpenAI-compatible base URL (`https://generativelanguage.googleapis.com/v1beta/openai/`), model `gemini-3.5-flash-lite`. Config names are kept from the original build: `VULTR_INFERENCE_API_KEY`, `VULTR_MODEL`, `VULTR_INFERENCE_BASE_URL`, `STUB_LLM`. Always set `VULTR_MODEL` explicitly. No new inference plumbing.
- Receipts: Ed25519 signatures.
- Frontend: static `web/index.html` and `web/app.js`, no framework.

## Honesty rules
- Never claim live inference until it is verified end to end on the real host (health not stub, model named in a receipt).
- Verdicts come from the rules floor as a minimum. The model can raise a verdict, never lower it.
- If the model errors, fall back to the rules verdict.
- Mark spec tasks done only when actually done; leave unrun acceptance tests PENDING.
