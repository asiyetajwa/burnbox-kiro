# Burn Box

Burn Box is a detonation chamber for small teams: forward a suspicious email, file, or link and get a plain-English verdict with a signed receipt.

This repository is the Kiroween 2026 build of Burn Box, entered in the **Frankenstein** category: four systems stitched into one product.

1. **Intake**: email forwarding, file upload, and link submission.
2. **Detonation**: each artifact is opened inside a disposable sandboxed box (Docker with a gVisor runtime) that is destroyed after the run.
3. **Verdict**: behavior observed in the box is judged by the model and explained in plain English.
4. **Receipt**: every run ends in a signed receipt that can be verified on a public page.

## Built with Kiro

This build is developed in Kiro. The `/.kiro` directory at the repo root holds the steering documents and feature specs that drive the build, and it is part of the submission. The build includes live model inference, verdict history with a team workspace, a link-only quick check, and a public receipt verification page.

## Live demo

http://136.109.165.109

## License

MIT
