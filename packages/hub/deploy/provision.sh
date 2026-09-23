#!/usr/bin/env bash
# Provision Loupe Hub on Google Cloud. Idempotent: safe to re-run; every step
# checks whether its resource already exists and never deletes anything.
#
#   GCP_PROJECT=loupe-hub BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX bash packages/hub/deploy/provision.sh
#
# Creates (billable resources marked $):
#   - project GCP_PROJECT (if missing) linked to BILLING_ACCOUNT
#   - VPC "loupe-hub-net" + subnet (its own network, so no default wide-open SSH rule)
#   - firewall: tcp:80,443 from anywhere; tcp:22 only from Google IAP (35.235.240.0/20)
#   - $ static external IPv4 "loupe-hub-ip" in REGION
#   - service account "loupe-hub-vm" (log/metric writer only) the VM runs as
#   - $ VM "loupe-hub": e2-micro, Debian 12, 30 GB pd-standard (free-tier shape)
# Then runs setup-vm.sh on the VM (Node 24, Postgres 16, Caddy, systemd)
# and deploy.sh (ships the code).
#
# Uses ONLY the "loupe-hub" gcloud configuration; other configs are untouched.
set -euo pipefail

export CLOUDSDK_ACTIVE_CONFIG_NAME="${CLOUDSDK_ACTIVE_CONFIG_NAME:-loupe-hub}"
: "${GCP_PROJECT:?set GCP_PROJECT}"
REGION="${REGION:-us-central1}"
ZONE="${ZONE:-us-central1-a}"
VM="${VM:-loupe-hub}"
NET="${NET:-loupe-hub-net}"
IP_NAME="${IP_NAME:-loupe-hub-ip}"
HERE="$(cd "$(dirname "$0")" && pwd)"

g() { gcloud --project "$GCP_PROJECT" "$@"; }

echo "== project $GCP_PROJECT"
if ! gcloud projects describe "$GCP_PROJECT" >/dev/null 2>&1; then
  gcloud projects create "$GCP_PROJECT" --name="Loupe Hub"
fi
if [ "$(gcloud billing projects describe "$GCP_PROJECT" --format='value(billingEnabled)')" != "True" ]; then
  : "${BILLING_ACCOUNT:?set BILLING_ACCOUNT to link billing}"
  gcloud billing projects link "$GCP_PROJECT" --billing-account="$BILLING_ACCOUNT"
fi
gcloud config set project "$GCP_PROJECT" >/dev/null
gcloud config set compute/zone "$ZONE" >/dev/null
gcloud config set compute/region "$REGION" >/dev/null
g services enable compute.googleapis.com iap.googleapis.com iam.googleapis.com

echo "== network $NET"
if ! g compute networks describe "$NET" >/dev/null 2>&1; then
  g compute networks create "$NET" --subnet-mode=custom
fi
if ! g compute networks subnets describe "$NET-$REGION" --region "$REGION" >/dev/null 2>&1; then
  g compute networks subnets create "$NET-$REGION" --network="$NET" --region="$REGION" --range=10.20.0.0/24
fi
if ! g compute firewall-rules describe loupe-hub-web >/dev/null 2>&1; then
  g compute firewall-rules create loupe-hub-web --network="$NET" --direction=INGRESS \
    --allow=tcp:80,tcp:443 --source-ranges=0.0.0.0/0 --target-tags=loupe-hub
fi
if ! g compute firewall-rules describe loupe-hub-ssh-iap >/dev/null 2>&1; then
  g compute firewall-rules create loupe-hub-ssh-iap --network="$NET" --direction=INGRESS \
    --allow=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=loupe-hub
fi

echo "== static IP"
if ! g compute addresses describe "$IP_NAME" --region "$REGION" >/dev/null 2>&1; then
  g compute addresses create "$IP_NAME" --region "$REGION" --network-tier=STANDARD
fi
IP="$(g compute addresses describe "$IP_NAME" --region "$REGION" --format='value(address)')"
echo "   $IP"

echo "== service account"
# The VM runs as its own least-privilege identity instead of the default compute account.
SA="loupe-hub-vm@$GCP_PROJECT.iam.gserviceaccount.com"
if ! g iam service-accounts describe "$SA" >/dev/null 2>&1; then
  g iam service-accounts create loupe-hub-vm --display-name="Loupe Hub VM"
fi
for role in roles/logging.logWriter roles/monitoring.metricWriter; do
  g projects add-iam-policy-binding "$GCP_PROJECT" --member="serviceAccount:$SA" --role="$role" --condition=None >/dev/null
done

echo "== VM $VM"
if ! g compute instances describe "$VM" --zone "$ZONE" >/dev/null 2>&1; then
  g compute instances create "$VM" --zone "$ZONE" \
    --machine-type=e2-micro --subnet="$NET-$REGION" --network-tier=STANDARD --address="$IP" \
    --image-family=debian-12 --image-project=debian-cloud \
    --boot-disk-size=30GB --boot-disk-type=pd-standard \
    --service-account="$SA" --scopes=cloud-platform \
    --tags=loupe-hub --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring
elif [ "$(g compute instances describe "$VM" --zone "$ZONE" --format='value(serviceAccounts[0].email)')" != "$SA" ]; then
  # Changing a VM's service account requires it to be stopped (~1 min downtime; static IP kept).
  echo "   switching $VM to $SA (stop/start)"
  g compute instances stop "$VM" --zone "$ZONE"
  g compute instances set-service-account "$VM" --zone "$ZONE" --service-account="$SA" --scopes=cloud-platform
  g compute instances start "$VM" --zone "$ZONE"
fi
echo "   waiting for SSH over IAP…"
for _ in $(seq 1 30); do
  g compute ssh "$VM" --zone "$ZONE" --tunnel-through-iap --command=true --quiet >/dev/null 2>&1 && break
  sleep 10
done

DOMAIN="${HUB_DOMAIN:-${IP//./-}.sslip.io}"
echo "== VM setup (domain $DOMAIN)"
g compute scp --zone "$ZONE" --tunnel-through-iap --quiet \
  "$HERE/setup-vm.sh" "$HERE/loupe-hub.service" "$HERE/Caddyfile" "$VM:/tmp/"
g compute ssh "$VM" --zone "$ZONE" --tunnel-through-iap --quiet \
  --command="sudo HUB_DOMAIN='$DOMAIN' GOOGLE_CLIENT_ID='${GOOGLE_CLIENT_ID:-}' bash /tmp/setup-vm.sh"

GCP_PROJECT="$GCP_PROJECT" ZONE="$ZONE" VM="$VM" bash "$HERE/deploy.sh"

echo
echo "Loupe Hub: https://$DOMAIN"
