# Requirements: live inference with provider-neutral labels

## Introduction
The original build labels everything `vultr`. This feature makes labels provider-neutral and points inference at Gemini (`gemini-3.5-flash-lite`) through the existing OpenAI-compatible config.

## Requirements

### R1: Provider-neutral verdict source
User story: as a reader of the API, I want the verdict source to name the kind of author, not a vendor.
- WHEN a verdict is written by the model THEN `Verdict.source` SHALL be `'model'`; otherwise `'rules'`.

### R2: Health reports the model
- WHEN `GET /api/health` is called and stub mode is on THEN `inference` SHALL be `'stub'`.
- WHEN stub mode is off THEN `inference` SHALL be the configured model name (`VULTR_MODEL`), or `'auto'` if unset.

### R3: Receipt names the author
- WHEN a verdict is model-written THEN receipt `verdictBy` SHALL be like `Gemini (gemini-3.5-flash-lite)`.
- OTHERWISE `verdictBy` SHALL be `Burn Box rules`.

### R4: Configuration unchanged
- The system SHALL keep `VULTR_INFERENCE_API_KEY`, `VULTR_MODEL`, `VULTR_INFERENCE_BASE_URL`, `STUB_LLM`; no new inference plumbing.
- Defaults for deployment: base URL `https://generativelanguage.googleapis.com/v1beta/openai/`, `VULTR_MODEL=gemini-3.5-flash-lite`, `STUB_LLM=0`. `VULTR_MODEL` SHALL always be set explicitly.

### R5: Safety floor preserved
- The model MAY raise a verdict above the rules floor and SHALL NOT lower it.
- WHEN the model call fails THEN the system SHALL fall back to the rules verdict.

### R6: Acceptance (live)
- `GET /api/health` SHALL NOT report `stub`.
- The three standard samples (benign file, invoice email end to end, one link) SHALL run; at least one verdict SHALL be model-written (receipt names the model) and every verdict SHALL be correct.
- Status: PENDING (needs a host with the key; not run in build session 1).
