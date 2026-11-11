# Burn Box: Kiroween 2026 submission package

Kiroween 2026 (Devpost), Frankenstein category. Submission deadline: Friday, December 4, 2026, 2:00 PM PT (Saturday, December 5, 01:00 EAT). STATUS: package prepared 2026-11-09; video re-cut in progress; submission itself needs Brian's go.

## Fields

**Project title:** Burn Box

**Short description:**
Don't open it. Forward it. Burn Box detonates suspicious emails, files and links in disposable sandboxes, records everything they try, burns every box, and returns a plain-English verdict with a signed receipt anyone can verify.

**Long description:**
Small teams get the same phishing emails as big companies, without a security team to ask. "Is this invoice safe to open?" usually gets answered by opening it.

Burn Box answers it for them, and nobody has to open anything. Forward the suspicious email to Burn Box, or drop in a file or a link. Even reading the email happens inside a sealed box: Burn Box checks who really sent it, whether the sender's domain vouched for it, where replies really go, and whether its links lie about where they lead. Then it splits the email up. Every link and every attachment gets a fresh box of its own, running side by side.

For each part, Burn Box seals a fresh container on a Google Cloud VM: no network, a read-only system, no privileges, strict CPU, memory, process and time limits, and gVisor as a second kernel wall. It plants fake secrets inside (a cloud key, a crypto wallet, a password file) whose only job is to be reached for. Then it detonates the sample. Files run under strace, and links open in headless Chromium on a private lab network. Every file touch, process, connection attempt and form submission streams live to the screen. When the run ends, the box is destroyed and its removal confirmed.

Gemini reads the behavioural record and writes the verdict in plain English: what the sample pretended to be, what it actually tried, which canaries it reached for, how many escape attempts the wall stopped, and safe, suspicious or malicious with reasons. A rules floor from the evidence sets the minimum verdict; the model can raise it but never lower it, so a sample cannot talk its way to a softer verdict. If the model is unreachable, the rules verdict stands and the receipt says so honestly.

Every run ends with a signed receipt (Ed25519): the container, the limits applied, the canaries and the destroyed-at time. Receipts are publicly verifiable: the new build adds a verification page where anyone can paste or upload a receipt and check the signature, in the browser and on the server.

New in this build: a verdict history with team workspaces (a team shares runs through an unguessable code, no accounts, and team runs stay off the public list), a link-only quick check for "is this URL safe?" moments, and the public receipt verification page.

The demo is an "invoice overdue" email with two traps, forwarded to Burn Box unopened. The envelope box finds a spoofed sender (SPF, DKIM and DMARC fail), a reply-to address on a lookalike domain, and a link whose text lies about where it goes. Then two more boxes open. The attachment reads the planted cloud key and wallet, tries to send them home, tries to install itself and tries to delete shared files, and is blocked at every step. The link is a fake sign-in page. Burn Box types a fake login into it and traces the details to a collector on a different site. No human approval is needed, because nothing real is ever entered. Three boxes, three burns, one verdict: Malicious, delete it without opening anything.

The containment moment is the product. Burn Box does dangerous work that is only safe because of the box, and it shows the box holding in real time.

**How it was built with Kiro (the write-up the form asks for):**
Burn Box's Kiroween build was developed spec-first in Kiro, and the repository carries the evidence: a `/.kiro` directory at the root with steering documents (product, tech, structure) and five feature specs, each with requirements, design and task files.

1. Live inference: wiring Gemini verdicts into the existing detonation engine, with the source of every verdict labelled (model or rules) and named on its receipt.
2. Verdict history and team workspace: shared run history behind unguessable team codes, with tests proving team runs never leak into the public list.
3. Link-only quick check: a one-field URL check that produces the same signed receipt as a full run.
4. Receipt verification: a public page and API that verify Ed25519 receipt signatures. Building it surfaced and fixed a real bug: file and link receipts were signed over a field JSON drops on download, so they could never verify.
5. Host deploy: a spec'd, volume-preserving deployment to the live demo host, written as requirements, design and tasks before any command ran.

Each spec's tasks were worked in their own Kiro session, and the suite stayed green throughout: typecheck passes and 31 tests pass, including new tests for teams, quick checks and receipt verification. The specs also drove two production fixes after deployment: a file-permissions failure in the deploy script, and a model retirement (the originally specified Gemini model is no longer offered to new API keys; the build now runs on the verified successor, and the specs were updated to match reality).

**Technology tags:** Kiro, Google Cloud, Gemini, Docker, gVisor, Playwright, Chromium, strace, Node.js, TypeScript, Python, Server-Sent Events, Ed25519

**Category tags:** Security, AI Agents, Sandboxing, Small Business

**Public GitHub repository:** https://github.com/asiyetajwa/burnbox-kiro (MIT)

**Demo application URL:** http://136.109.165.109

**Test access for judges:** No account or credentials needed. The demo is open: run a sample, a file, or a link from the homepage. To try the team workspace, create a team on the site and note the code it shows once; the quick check is the link field marked quick, and receipt verification is the verify view linked from every receipt.

**Video presentation:** PENDING. Re-cut of the existing film to the new build, under 3 minutes, public on YouTube. Link lands here when Brian uploads it.

**Disclosure:** Burn Box was first built in November 2026 (asiyetajwa/burnbox). This repository is the Kiro rebuild and extension created for Kiroween; the pre-existing code is disclosed here and in the README. Two post-deploy fixes were made outside Kiro, on 2026-11-10:
- **Link boxes.** Under gVisor, link boxes could not resolve the lab's names, so a phishing link could not be opened at all. The box now gets those names in its hosts file. A page that never loads is also no longer called Safe: it is marked as not checked.
- **Verify page layout.** The receipt check rows wrapped one word per line; they now span the full width (a style-only fix).
- **Quick-check card.** Its reason rows wrapped one word per line, and its headline and severity bar ignored the verdict level. Both are fixed (2026-11-11).

## Safety notes for judges

- Every test sample is self-written and does nothing outside a Burn Box. There is no real malware in the repo or the demo.
- The "collector" and the fake sign-in page live on a private Docker network with no route to the internet.
- The sample's own output cannot talk the model into a softer verdict: a rules floor from the evidence sets the minimum, and the model can only raise it.
- Receipts issued by the previous build still verify on the new one: the signing key lives in a data volume that the deployment was spec'd to preserve, and a pre-deploy receipt was re-verified after the deploy as an acceptance test.
