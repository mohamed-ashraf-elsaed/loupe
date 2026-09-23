#!/usr/bin/env bash
# Ship the current packages/hub code to the VM and restart the service. One command:
#   GCP_PROJECT=loupe-hub bash packages/hub/deploy/deploy.sh
# Idempotent. Requires provision.sh (or setup-vm.sh) to have run once.
set -euo pipefail

export CLOUDSDK_ACTIVE_CONFIG_NAME="${CLOUDSDK_ACTIVE_CONFIG_NAME:-loupe-hub}"
: "${GCP_PROJECT:?set GCP_PROJECT}"
ZONE="${ZONE:-us-central1-a}"
VM="${VM:-loupe-hub}"
HUB="$(cd "$(dirname "$0")/.." && pwd)"
TAR="$(mktemp -t loupe-hub.XXXXXX).tgz"
trap 'rm -f "$TAR"' EXIT

# Runtime files only: no tests, local data, node_modules or deploy tooling.
(cd "$HUB" && tar -czf "$TAR" package.json ./*.ts tools)

gcloud --project "$GCP_PROJECT" compute scp --zone "$ZONE" --tunnel-through-iap --quiet "$TAR" "$VM:/tmp/loupe-hub.tgz"
gcloud --project "$GCP_PROJECT" compute ssh "$VM" --zone "$ZONE" --tunnel-through-iap --quiet --command='
set -euo pipefail
sudo rm -rf /opt/loupe-hub.new && sudo mkdir -p /opt/loupe-hub.new
sudo tar -xzf /tmp/loupe-hub.tgz -C /opt/loupe-hub.new
cd /opt/loupe-hub.new && sudo npm install --omit=dev --no-audit --no-fund --loglevel=error
sudo rm -rf /opt/loupe-hub.old
[ -d /opt/loupe-hub ] && sudo mv /opt/loupe-hub /opt/loupe-hub.old
sudo mv /opt/loupe-hub.new /opt/loupe-hub
sudo systemctl restart loupe-hub
for i in $(seq 1 20); do curl -fsS http://127.0.0.1:8790/v1/health && exit 0; sleep 1; done
sudo journalctl -u loupe-hub -n 50 --no-pager; exit 1
'
echo
echo "deploy: ok"
