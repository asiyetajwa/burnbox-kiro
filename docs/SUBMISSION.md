# Burn Box: LabLab submission draft

Vultr Agent Rush, Challenge 1: Blast Radius Zero. Submission deadline: Nov 8, 2026, 23:00 UTC (Nov 9, 02:00 EAT). Internal target: Nov 8.

## Fields

**Project title:** Burn Box

**Short description (under 255 characters):**
Don't open it. Forward it. Burn Box detonates suspicious emails, files and links in disposable sandboxes on Vultr, records everything they try, burns every box, and returns a plain-English verdict with a signed destruction receipt.

**Long description:**
Small teams get the same phishing emails as big companies, without a security team to ask. "Is this invoice safe to open?" usually gets answered by opening it.

Burn Box answers it for them, and nobody has to open anything. Forward the suspicious email to Burn Box, or drop in a file or a link. Even reading the email happens inside a sealed box: Burn Box checks who really sent it, whether the sender's domain vouched for it, where replies really go, and whether its links lie about where they lead. Then the agent splits the email up. Every link and every attachment gets a fresh box of its own, running side by side.

For each part, the agent seals a fresh container on a Vultr VM: no network, a read-only system, no privileges, strict CPU, memory, process and time limits, and gVisor as a second kernel wall. It plants fake secrets inside (a cloud key, a crypto wallet, a password file) whose only job is to be reached for. Then it detonates the sample. Files run under strace, and links open in headless Chromium on a private lab network. Every file touch, process, connection attempt and form submission streams live to the screen. When the run ends, the box is destroyed and its removal confirmed.

An LLM on Vultr Serverless Inference reads the behavioural record and writes the verdict in plain English: what the sample pretended to be, what it actually tried, which canaries it reached for, how many escape attempts the wall stopped, and safe, suspicious or malicious with reasons. Every run ends with a destruction receipt signed with Ed25519: the container, the limits applied, the canaries and the destroyed-at time.

The demo is an "invoice overdue" email with two traps, forwarded to Burn Box unopened. The envelope box finds a spoofed sender (SPF, DKIM and DMARC fail), a reply-to address on a lookalike domain, and a link whose text lies about where it goes. Then two more boxes open. The attachment reads the planted cloud key and wallet, tries to send them home, tries to install itself and tries to delete shared files, and is blocked at every step. The link is a fake sign-in page. Burn Box types a fake login into it and traces the details to a collector on a different site. No human approval is needed, because nothing real is ever entered. Three boxes, three burns, one verdict: Malicious, delete it without opening anything.

The containment moment is the product. Burn Box does dangerous work that is only safe because of the box, and it shows the box holding in real time.

**Technology tags:** Vultr, Vultr Serverless Inference, Vultr Cloud Compute, Docker, gVisor, Playwright, Chromium, strace, Node.js, TypeScript, Python, Server-Sent Events, Ed25519

**Category tags:** Security, AI Agents, Sandboxing, Small Business

**Vultr usage:**
- Vultr Cloud Compute VM (Ubuntu 24.04, Los Angeles, 2 vCPU / 4 GB) runs the control app, Docker, gVisor and every detonation box. One box per run, destroyed after.
- Vultr Serverless Inference (OpenAI-compatible API at https://api.vultrinference.com/v1) writes every verdict. The key lives only on the VM host, never inside a box.

**Public GitHub repository:** https://github.com/asiyetajwa/burnbox (MIT)

**Demo application URL:** to add once the VM is live (http://<vm-ip> or a domain).

**Video presentation:** to add (YouTube, public).

**Cover image / slides:** to add.

## Safety notes for judges

- Every test sample is self-written and does nothing outside a Burn Box. There is no real malware in the repo or the demo.
- The "collector" and the fake sign-in page live on a private Docker network with no route to the internet.
- The sample's own output cannot talk the model into a softer verdict: a rules floor from the evidence sets the minimum, and the model can only raise it.
