# Burn Box: product

Burn Box is a detonation chamber for small teams. Forward a suspicious email, upload a file, or paste a link. Burn Box opens it in a sealed, disposable sandbox with no internet, watches what it does, and returns a plain-English verdict (safe, suspicious, malicious) with a signed receipt.

Audience: non-technical small-business staff. Output is plain English, short sentences, no jargon, no em dashes.

## The four Frankenstein systems
Burn Box stitches four unrelated systems into one product:
1. Intake: email forwarding (inbound SMTP), file upload, link paste.
2. Sandboxed detonation: a fresh Docker container per run (gVisor `runsc` where available) with planted fake secrets (canaries) and blocked egress.
3. Verdict: a rules floor from recorded evidence, with a language model writing the explanation and allowed to raise severity.
4. Signed receipt: an Ed25519-signed record of what ran, what was blocked, who wrote the verdict, and when the box was destroyed.

## Kiroween 2026
This repo (burnbox-kiro) is the Kiroween 2026 entry, Frankenstein category, built with Kiro specs and steering. It is ported from the public MIT original Burn Box (commit 19783c5). `docs/SUBMISSION.md` is a template from the original and is not the Kiroween submission.
