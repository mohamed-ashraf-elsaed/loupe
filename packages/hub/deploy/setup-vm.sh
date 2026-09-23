#!/usr/bin/env bash
# One-time (and re-runnable) VM setup for Loupe Hub. Run as root ON the VM:
#   sudo HUB_DOMAIN=hub.example.com GOOGLE_CLIENT_ID=… bash setup-vm.sh
# Expects loupe-hub.service and Caddyfile next to it (provision.sh copies them to /tmp).
set -euo pipefail

: "${HUB_DOMAIN:?set HUB_DOMAIN}"
SRC="$(cd "$(dirname "$0")" && pwd)"
export DEBIAN_FRONTEND=noninteractive

# e2-micro has 1 GB RAM: add swap so npm install / Postgres never OOM.
if ! swapon --show | grep -q /swapfile; then
  [ -f /swapfile ] || { fallocate -l 1G /swapfile; chmod 600 /swapfile; mkswap /swapfile; }
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

apt-get update -q
apt-get install -y -q curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https unattended-upgrades

# Node 24 (NodeSource)
if ! node --version 2>/dev/null | grep -q '^v24\.'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y -q nodejs
fi

# Postgres 16 (PGDG; Debian 12 ships 15). Listens on localhost only by default.
if ! dpkg -s postgresql-16 >/dev/null 2>&1; then
  apt-get install -y -q postgresql-common
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
  apt-get install -y -q postgresql-16
fi
grep -Eq "^\s*listen_addresses\s*=\s*'localhost'" /etc/postgresql/16/main/postgresql.conf \
  || echo "listen_addresses = 'localhost'" >> /etc/postgresql/16/main/postgresql.conf
systemctl enable --now postgresql

# Caddy (official repo)
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
fi

# Service user + database (peer auth over the Unix socket: no DB password to manage).
id loupehub >/dev/null 2>&1 || useradd --system --home-dir /opt/loupe-hub --shell /usr/sbin/nologin loupehub
mkdir -p /opt/loupe-hub
su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='loupehub'\"" | grep -q 1 \
  || su postgres -c "psql -c 'CREATE ROLE loupehub LOGIN'"
su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='loupehub'\"" | grep -q 1 \
  || su postgres -c "createdb -O loupehub loupehub"
systemctl restart postgresql

# Secrets: /etc/loupe-hub.env (0600, root). Created once; the session secret is never rotated by re-runs.
ENV=/etc/loupe-hub.env
if [ ! -f "$ENV" ]; then
  umask 077
  cat > "$ENV" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=8790
DATABASE_URL=postgresql://loupehub@/loupehub?host=/var/run/postgresql
HUB_SESSION_SECRET=$(openssl rand -hex 32)
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
EOF
fi
if [ -n "${GOOGLE_CLIENT_ID:-}" ]; then
  sed -i "s|^GOOGLE_CLIENT_ID=.*|GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}|" "$ENV"
fi
chown root:root "$ENV"
chmod 600 "$ENV"

# systemd unit (started by deploy.sh once code is in place)
install -m 644 "$SRC/loupe-hub.service" /etc/systemd/system/loupe-hub.service
systemctl daemon-reload
systemctl enable loupe-hub

# Caddy: automatic HTTPS for HUB_DOMAIN
sed "s|__HUB_DOMAIN__|${HUB_DOMAIN}|" "$SRC/Caddyfile" > /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload caddy 2>/dev/null || systemctl restart caddy

echo "setup-vm: done (domain ${HUB_DOMAIN})"
