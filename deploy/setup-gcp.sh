#!/usr/bin/env bash
# Burn Box (Kiroween 2026 tree) on a GCP VM (Ubuntu 24.04 LTS). Run as root, by the deployer, ON THE HOST:
#   sudo bash deploy/setup-gcp.sh        (or fetch it from the repo and run it)
# See .kiro/specs/host-deploy/ for the runbook, the acceptance test and the rollback.
#
# What it does, in order:
#   1. installs Docker and gVisor (runsc) if missing
#   2. backs up the burnbox-data volume (receipt signing key, run history, teams) to /var/backups/burnbox
#   3. puts the checkout at /opt/burnbox (same path as the old stack, so Compose reuses burnbox_burnbox-data)
#   4. writes .env only if there is none (never overwrites), with a key placeholder
#   5. builds and starts the stack, opens UFW for SSH and 80, waits for /api/health
#
# It never runs `docker compose down -v`, never removes a volume, and never prints the inference key.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/asiyetajwa/burnbox-kiro.git}"
BRANCH="${BRANCH:-main}"
DIR="${DIR:-/opt/burnbox}"                      # decision: same path as the old stack
PROJECT="burnbox"                               # pins the Compose project, so the volume is burnbox_burnbox-data
VOLUME="${PROJECT}_burnbox-data"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/burnbox}"
STAMP="$(date +%Y%m%d-%H%M%S)"

[ "$(id -u)" = "0" ] || { echo "Run as root (sudo)." >&2; exit 1; }
umask 077
mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"

# 1. Docker and gVisor -------------------------------------------------------------------------
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
if ! command -v git >/dev/null; then apt-get update && apt-get install -y git; fi

# gVisor gives every box its own user-space kernel: a stronger wall than plain containers.
if [ "${WITH_GVISOR:-1}" = "1" ] && ! command -v runsc >/dev/null; then
  curl -fsSL https://gvisor.dev/archive.key | gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" > /etc/apt/sources.list.d/gvisor.list
  apt-get update && apt-get install -y runsc
  runsc install
  systemctl restart docker
fi

# 2. Volume check and backup -------------------------------------------------------------------
# The volume holds data/keys/receipt-ed25519.pem. If it is recreated, every receipt issued so far stops verifying.
if docker volume inspect "$VOLUME" >/dev/null 2>&1; then
  docker volume inspect "$VOLUME" > "$BACKUP_DIR/volume-inspect-before-$STAMP.json"
  docker run --rm -v "$VOLUME":/data:ro -v "$BACKUP_DIR":/backup busybox \
    tar czf "/backup/burnbox-data-$STAMP.tar.gz" -C /data .
  chmod 600 "$BACKUP_DIR/burnbox-data-$STAMP.tar.gz"
  echo "Volume $VOLUME backed up to $BACKUP_DIR/burnbox-data-$STAMP.tar.gz"
else
  echo "NOTE: volume $VOLUME does not exist. If this is not a first install, STOP: a new volume means a new signing key."
  [ "${FIRST_INSTALL:-0}" = "1" ] || { echo "Set FIRST_INSTALL=1 to continue on a fresh host." >&2; exit 1; }
fi

# 3. Checkout ----------------------------------------------------------------------------------
OLD_ENV=""
if [ -d "$DIR/.git" ] && git -C "$DIR" remote get-url origin 2>/dev/null | grep -q 'burnbox-kiro'; then
  # Already the new repo: back up .env and update in place.
  [ -f "$DIR/.env" ] && cp -p "$DIR/.env" "$BACKUP_DIR/env-$STAMP" && cp -p "$DIR/.env" "$DIR/.env.bak-$STAMP"
  git -C "$DIR" fetch origin "$BRANCH"
  git -C "$DIR" checkout "$BRANCH"
  git -C "$DIR" pull --ff-only origin "$BRANCH"
else
  if [ -e "$DIR" ]; then
    # Old repo (or anything else) is at the path. Keep it whole, with its .env, for rollback.
    if [ -f "$DIR/.env" ]; then
      cp -p "$DIR/.env" "$DIR/.env.bak-$STAMP"
      cp -p "$DIR/.env" "$BACKUP_DIR/env-$STAMP"
      OLD_ENV="$DIR.bak-$STAMP/.env.bak-$STAMP"
    fi
    mv "$DIR" "$DIR.bak-$STAMP"
    echo "Old checkout kept at $DIR.bak-$STAMP (its .env copy: ${OLD_ENV:-none})"
  fi
  mkdir -p "$(dirname "$DIR")"
  git clone --branch "$BRANCH" "$REPO_URL" "$DIR"
fi
cd "$DIR"

# 4. .env (never overwritten) ------------------------------------------------------------------
# Reads a plain, safe value for KEY from the old .env copy. The old (Vultr) inference key is never read.
oldv() {
  [ -n "$OLD_ENV" ] && [ -f "$OLD_ENV" ] || return 0
  local v; v="$(grep -E "^$1=" "$OLD_ENV" | tail -n1 | cut -d= -f2- || true)"
  if [[ "$v" =~ ^[A-Za-z0-9._:@-]+$ ]]; then printf '%s' "$v"; fi
}
if [ -f .env ]; then
  echo ".env already exists in $DIR. Leaving it untouched."
else
  RT="$(command -v runsc >/dev/null && echo runsc || echo)"
  MD="$(oldv MAIL_DOMAIN)";            MD="${MD:-burnbox.dribble360.com}"
  PP="$(oldv PUBLIC_PORT)";            PP="${PP:-80}"
  RH="$(oldv RUNS_PER_HOUR)";          RH="${RH:-30}"
  MC="$(oldv MAX_CONCURRENT_RUNS)";    MC="${MC:-2}"
  cat > .env <<ENV
# Burn Box host config. Lives only on this host. Never commit it. Never paste the key into a chat.
COMPOSE_PROJECT_NAME=$PROJECT
# Inference: Gemini through its OpenAI-compatible endpoint (the VULTR_* names are kept from the original build).
# Put the Gemini key on the VULTR_INFERENCE_API_KEY line by hand (e.g. nano .env). It is supplied separately.
VULTR_INFERENCE_API_KEY=
VULTR_INFERENCE_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
VULTR_MODEL=gemini-2.5-flash
STUB_LLM=0
SANDBOX_RUNTIME=$RT
PUBLIC_PORT=$PP
RUNS_PER_HOUR=$RH
MAX_CONCURRENT_RUNS=$MC
MAIL_DOMAIN=$MD
ENV
  chmod 600 .env
  echo "Wrote $DIR/.env with an EMPTY key line."
fi

# The app must not start in "no key" mode by accident. Never echo the key itself.
if ! grep -Eq '^VULTR_INFERENCE_API_KEY=.+' .env; then
  echo "STOP: VULTR_INFERENCE_API_KEY is empty in $DIR/.env. Put the Gemini key there, then run this script again." >&2
  exit 3
fi
if grep -Eq '^STUB_LLM=1' .env; then echo "STOP: STUB_LLM=1 in .env. Set STUB_LLM=0." >&2; exit 3; fi

# 5. Build and start ---------------------------------------------------------------------------
# Compose derives the volume name from the project. Show it, and refuse if it is not the existing one.
VOL_FROM_COMPOSE="$(docker compose -p "$PROJECT" config --volumes | head -n1)"
[ "$VOL_FROM_COMPOSE" = "burnbox-data" ] || { echo "Unexpected volume key: $VOL_FROM_COMPOSE" >&2; exit 4; }

# Box images: only when missing, or when you ask (REBUILD_IMAGES=1) because sandbox/ changed.
if [ "${REBUILD_IMAGES:-0}" = "1" ] || ! docker image inspect burnbox-box:latest >/dev/null 2>&1 || ! docker image inspect burnbox-browser:latest >/dev/null 2>&1; then
  docker compose -p "$PROJECT" --profile images build
fi
docker compose -p "$PROJECT" up -d --build

# Firewall: SSH and the web app only. SSH is allowed first so enabling UFW cannot lock you out.
# (GCP also needs the VPC rule for tcp:80 on this VM. Mail on 25 stays closed until the MX change.)
if command -v ufw >/dev/null; then ufw allow OpenSSH && ufw allow 80/tcp && ufw --force enable; fi

# 6. Wait for health, then check the volume is the same one ---------------------------------------
echo "Waiting for health..."
for i in $(seq 1 30); do
  if curl -fsS http://localhost/api/health >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -sS http://localhost/api/health || true; echo
docker volume inspect "$VOLUME" > "$BACKUP_DIR/volume-inspect-after-$STAMP.json"
echo "Volume before/after (CreatedAt must match):"
grep -h CreatedAt "$BACKUP_DIR"/volume-inspect-*-"$STAMP".json || true
echo "Next: run the acceptance test in .kiro/specs/host-deploy/tasks.md. Rollback is in design.md."
