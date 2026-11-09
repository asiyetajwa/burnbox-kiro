# Design: host deploy

## Decisions
- Host: GCP VM at 136.109.165.109, Ubuntu 24.04, Docker, gVisor `runsc` already installed.
- Checkout path: `/opt/burnbox` (decision, R1.1). The old repo is moved to `/opt/burnbox.bak-<stamp>`.
- Volume reuse: of the three options (keep the path, set `COMPOSE_PROJECT_NAME`, declare the volume external), the chosen one is **keep the checkout at `/opt/burnbox`**. The project name then defaults to `burnbox` and the volume to `burnbox_burnbox-data` with no change to `docker-compose.yml`. As a guard, `.env` also sets `COMPOSE_PROJECT_NAME=burnbox` and every command passes `-p burnbox`. This guard matters mostly for rollback, where the old checkout sits in a differently named directory.
- Backups live in `/var/backups/burnbox/` (root only, mode 700, files mode 600): `burnbox-data-<stamp>.tar.gz`, `env-<stamp>`, `volume-inspect-before-<stamp>.json`, `volume-inspect-after-<stamp>.json`. The old `.env` copy also sits in the moved-aside checkout.
- Placeholders: `<stamp>` is `date +%Y%m%d-%H%M%S`, set once with `STAMP=$(date +%Y%m%d-%H%M%S)` and reused in the same shell.

## Script: `deploy/setup-gcp.sh`
Run as root on the host. Based on `setup-vultr.sh` of the old repo, but for the new repo and GCP. Steps:
1. Install Docker and gVisor if missing.
2. If `burnbox_burnbox-data` exists: save `docker volume inspect`, tar the volume to `/var/backups/burnbox`. If it does not exist, stop unless `FIRST_INSTALL=1`.
3. Checkout: if `/opt/burnbox` is already a burnbox-kiro clone, back up `.env` and `git pull --ff-only`. Otherwise back up `.env`, `mv /opt/burnbox /opt/burnbox.bak-<stamp>` and `git clone https://github.com/asiyetajwa/burnbox-kiro.git /opt/burnbox`.
4. `.env`: written only if absent. Non-secret settings (`MAIL_DOMAIN`, `PUBLIC_PORT`, `RUNS_PER_HOUR`, `MAX_CONCURRENT_RUNS`) are carried from the old `.env` copy; the rest are the Gemini values. The key line is empty. The script stops (exit 3) until the deployer fills it, then is run again; the second run keeps the `.env` untouched.
5. Build box images only if missing or `REBUILD_IMAGES=1`; then `docker compose -p burnbox up -d --build`.
6. UFW: allow OpenSSH, then 80/tcp, then enable. (The GCP VPC firewall must also allow tcp:80.)
7. Wait for `/api/health`, then save the "after" volume inspect.
The script contains no key value and prints none.

## Runbook (manual, in order)

### 0. Before the window
- The commit to deploy is pushed to `asiyetajwa/burnbox-kiro` `main` by the owner (not done in this session).
- The Gemini key is available to the deployer outside the repo.

### 1. Capture an old receipt (R5.1)
On the old UI at `http://136.109.165.109/`, open a past run (or make a new file run), click Download receipt. Save it as `old-receipt-<runid>.json` somewhere off the host. Save a second one if the history has both a file and an email run (the file receipt is the one that exercises `legacyCanonical`).

### 2. Pre-flight on the host
```bash
STAMP=$(date +%Y%m%d-%H%M%S)
sudo mkdir -p /var/backups/burnbox && sudo chmod 700 /var/backups/burnbox
docker volume ls | grep burnbox_burnbox-data
docker volume inspect burnbox_burnbox-data | sudo tee /var/backups/burnbox/volume-inspect-before-$STAMP.json
curl -s http://136.109.165.109/api/health
```
The volume must be listed. If it is not, stop.

### 3. Back up the volume and the env (R2.3, R3.2)
```bash
sudo docker run --rm -v burnbox_burnbox-data:/data:ro -v /var/backups/burnbox:/backup busybox \
  tar czf /backup/burnbox-data-$STAMP.tar.gz -C /data .
sudo tar tzf /var/backups/burnbox/burnbox-data-$STAMP.tar.gz | grep -E 'keys/receipt-ed25519.pem|teams.json|runs/' | head
sudo cp -p /opt/burnbox/.env /opt/burnbox/.env.bak-$STAMP
sudo cp -p /opt/burnbox/.env /var/backups/burnbox/env-$STAMP
sudo chmod 600 /var/backups/burnbox/*
```
Note the full volume name. `-v burnbox-data:/data` would create a new empty volume. The tar listing must show the key file.

### 4. Deploy
Preferred: run the script (it repeats steps 2 and 3 itself, harmlessly).
```bash
sudo bash -c 'curl -fsSL https://raw.githubusercontent.com/asiyetajwa/burnbox-kiro/main/deploy/setup-gcp.sh -o /tmp/setup-gcp.sh'
sudo bash /tmp/setup-gcp.sh           # stops at exit 3: key empty
sudo nano /opt/burnbox/.env           # type the Gemini key on VULTR_INFERENCE_API_KEY=, save
sudo bash /tmp/setup-gcp.sh           # builds and starts
```
Manual equivalent after the checkout and `.env` are in place:
```bash
cd /opt/burnbox
docker compose -p burnbox config --volumes            # must print: burnbox-data
docker compose -p burnbox --profile images build      # ONLY if sandbox/ changed
docker compose -p burnbox up -d --build
```
`up -d --build` recreates containers and reuses the named volume. `down` is not needed. If you do run it, it is `docker compose -p burnbox down` and never `-v`.

### 5. Health (R4)
```bash
curl -s http://136.109.165.109/api/health
curl -s -o /dev/null -w '%{http_code}\n' http://136.109.165.109/
docker volume inspect burnbox_burnbox-data | sudo tee /var/backups/burnbox/volume-inspect-after-$STAMP.json
diff <(grep -E '"(Name|CreatedAt)"' /var/backups/burnbox/volume-inspect-before-$STAMP.json) \
     <(grep -E '"(Name|CreatedAt)"' /var/backups/burnbox/volume-inspect-after-$STAMP.json) && echo VOLUME SAME
```
Pass: `ok:true`, `docker/box/browser` true, `runtime:"runsc"`, `inference:"gemini-2.5-flash"`, homepage 200, `VOLUME SAME`. Any miss: go to rollback.

### 6. Acceptance (tasks.md section 5) 
Run in the order of R5. Step 5.4 is the key proof: paste the saved old receipt on `#verify`. Expect VALID in both "This server says" and "Your browser says".

## Why old receipts still verify
They were signed by the Ed25519 key in `data/keys/receipt-ed25519.pem`. The key is in the reused volume, so `GET /api/pubkey` returns the same public key. File and link receipts signed with `parent: undefined` verify through `legacyCanonical()`; email receipts verify through `canonical()`. The deploy must not change `server/src/receipt.ts` semantics. If the volume were recreated, a new key would be generated on first start and every old receipt would show INVALID.

## Rollback (R6)
Trigger: health fails, or any acceptance check fails and cannot be fixed in the window. Use the stamp of the deploy.
```bash
STAMP=<stamp of the deploy>
cd /opt/burnbox && docker compose -p burnbox down            # no -v, ever
sudo mv /opt/burnbox /opt/burnbox-kiro.failed-$STAMP
sudo mv /opt/burnbox.bak-$STAMP /opt/burnbox
sudo cp -p /opt/burnbox/.env.bak-$STAMP /opt/burnbox/.env    # the old .env, as backed up
cd /opt/burnbox && docker compose -p burnbox config --volumes   # must print burnbox-data
docker compose -p burnbox --profile images build               # only if the box images were rebuilt for the new tree
docker compose -p burnbox up -d --build
curl -s http://136.109.165.109/api/health
docker volume inspect burnbox_burnbox-data | grep CreatedAt    # must match the "before" file
```
`-p burnbox` is mandatory: from `/opt/burnbox` it matches the default, but it removes any doubt. The rollback reuses `burnbox_burnbox-data`, so history, teams and the signing key are intact. If the old app misbehaves because the new tree wrote files into the volume that it does not understand (the new tree only adds fields, but this is unverified), the tarball is the fallback:
```bash
docker compose -p burnbox stop app
sudo docker run --rm -v burnbox_burnbox-data:/data -v /var/backups/burnbox:/backup busybox \
  sh -c 'cd /data && tar xzf /backup/burnbox-data-'$STAMP'.tar.gz'
docker compose -p burnbox start app
```
This overwrites files inside the volume; it does not remove the volume. Use it only if the volume is damaged.

## What this deploy does not do
No DNS or MX change (burnbox.dribble360.com waits on the owner's Cloudflare sign-in; forwarded-email intake waits on that), port 25 stays closed in UFW, no submission, no payments, no push.

## Risks and unknowns
- The old host `.env` was not read in this session (no host access). The script carries only the four non-secret settings; if the old file has others (for example `MAIL_PUBLIC_PORT`, `DISABLE_IPV6`), copy them by hand from the backup.
- Whether the box image Dockerfiles need network at build time on the host was not checked. They have `debs/` and `wheels/` folders for offline builds, which are empty in the repo.
- Gemini rate limits and free-tier quotas may make 8.2 to 8.4 slow or fail; that would be a model error, and verdicts then fall back to the rules floor (and `verdictBy` would not name the model).
