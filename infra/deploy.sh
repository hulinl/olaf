#!/usr/bin/env bash
# OLAF deploy orchestrator — ported from hulinl/slotly/infra/deploy.sh.
#
# Run from repo root:
#   ./infra/deploy.sh provision   # one-time: register providers, create RG + resources
#   ./infra/deploy.sh build       # build & push backend image to ACR
#   ./infra/deploy.sh release     # roll the Container App to the latest image
#   ./infra/deploy.sh migrate     # run Django migrate + createcachetable
#   ./infra/deploy.sh logs        # tail backend logs
#   ./infra/deploy.sh smoke       # GET /healthz
#
# Requires: az CLI logged in, docker running, gh CLI logged in.

set -euo pipefail

RG="${OLAF_RG:-olaf-prod}"
LOCATION="${OLAF_LOCATION:-westeurope}"
GITHUB_REPO="${OLAF_GITHUB_REPO:-https://github.com/hulinl/olaf}"
GITHUB_BRANCH="${OLAF_GITHUB_BRANCH:-main}"
SUBSCRIPTION="${OLAF_SUBSCRIPTION:-$(az account show --query id -o tsv)}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFRA="$ROOT/infra"
SECRETS="$INFRA/.secrets"
mkdir -p "$SECRETS"

# ---------------------------------------------------------------------------

generate_secret() {
  python3 -c "import secrets;print(secrets.token_urlsafe(48))"
}

ensure_secret() {
  local name=$1 generator=$2
  local f="$SECRETS/$name"
  if [[ ! -f "$f" ]]; then
    "$generator" > "$f"
    chmod 600 "$f"
    echo "  generated $name → $f" >&2
  fi
  cat "$f"
}

provision() {
  echo "==> Registering Azure providers (idempotent)..."
  for p in Microsoft.App Microsoft.DBforPostgreSQL Microsoft.ContainerRegistry \
           Microsoft.Web Microsoft.Communication Microsoft.OperationalInsights \
           Microsoft.Insights Microsoft.Storage Microsoft.Network; do
    az provider register -n "$p" --wait >/dev/null
    echo "  $p registered"
  done

  echo "==> Creating resource group $RG in $LOCATION..."
  az group create -n "$RG" -l "$LOCATION" -o table

  local pg_password
  pg_password=$(ensure_secret postgres_admin_password generate_secret)
  local django_secret
  django_secret=$(ensure_secret django_secret_key generate_secret)

  local github_token=""
  if [[ -f "$SECRETS/github_token" ]]; then
    github_token=$(cat "$SECRETS/github_token")
  fi

  # Preserve currently-deployed image so re-provisioning doesn't revert.
  local current_image
  current_image=$(az containerapp show -g "$RG" -n olaf-api \
    --query "properties.template.containers[0].image" -o tsv 2>/dev/null || echo "")
  local image_param=""
  if [[ -n "$current_image" ]]; then
    image_param="backendInitialImage=$current_image"
    echo "  preserving current image: $current_image"
  fi

  echo "==> Deploying Bicep template..."
  az deployment group create \
    --resource-group "$RG" \
    --template-file "$INFRA/main.bicep" \
    --parameters \
      postgresPassword="$pg_password" \
      djangoSecretKey="$django_secret" \
      githubRepo="$GITHUB_REPO" \
      githubBranch="$GITHUB_BRANCH" \
      githubToken="$github_token" \
      $image_param \
    --query 'properties.outputs' -o json > "$SECRETS/last_outputs.json"
  echo "  outputs:"
  python3 -m json.tool < "$SECRETS/last_outputs.json"

  # Bicep doesn't currently declare the Container App custom-hostname
  # binding; re-bind api.olaf.events after every provision so the
  # custom domain stays attached.
  for host in api.olaf.events; do
    if ! az containerapp hostname list -g "$RG" -n olaf-api \
        --query "[?name=='$host'] | length(@)" -o tsv 2>/dev/null | grep -q '^1$'; then
      echo "==> Re-binding $host on olaf-api..."
      az containerapp hostname add -g "$RG" -n olaf-api --hostname "$host" >/dev/null 2>&1 || true
      az containerapp hostname bind -g "$RG" -n olaf-api --hostname "$host" \
        --environment olaf-env --validation-method CNAME >/dev/null 2>&1 || true
    fi
  done

  echo
  echo "✓ Provisioning complete. Outputs saved to $SECRETS/last_outputs.json"
}

_outputs() { cat "$SECRETS/last_outputs.json"; }

build() {
  local acr_login_server acr_name tag
  acr_login_server=$(_outputs | jq -r '.acrLoginServer.value')
  acr_name=$(_outputs | jq -r '.acrName.value')
  tag="${OLAF_TAG:-$(git rev-parse --short HEAD 2>/dev/null || echo latest)}"

  echo "==> Logging into ACR ($acr_name)..."
  az acr login --name "$acr_name"

  echo "==> Building backend image (linux/amd64) → $acr_login_server/olaf-api:$tag"
  docker buildx build \
    --platform linux/amd64 \
    -f "$ROOT/apps/api/Dockerfile.prod" \
    -t "$acr_login_server/olaf-api:$tag" \
    -t "$acr_login_server/olaf-api:latest" \
    --push \
    "$ROOT/apps/api"

  echo "$tag" > "$SECRETS/last_tag"
  echo "✓ Image pushed: $acr_login_server/olaf-api:$tag"
}

release() {
  local backend_name acr_login_server tag
  backend_name=$(_outputs | jq -r '.backendName.value')
  acr_login_server=$(_outputs | jq -r '.acrLoginServer.value')
  tag=$(cat "$SECRETS/last_tag")

  # Use the digest, not the tag, so re-pushed same-tag images still
  # roll a new revision (containerapp update --image <tag> is a no-op
  # when the image string hasn't changed).
  local digest
  digest=$(az acr repository show-manifests --name "$(_outputs | jq -r '.acrName.value')" \
    --repository olaf-api --orderby time_desc --top 1 \
    --query "[0].digest" -o tsv)

  echo "==> Updating Container App $backend_name → $acr_login_server/olaf-api@$digest"
  az containerapp update \
    --resource-group "$RG" \
    --name "$backend_name" \
    --image "$acr_login_server/olaf-api@$digest" \
    --query 'properties.latestRevisionName' -o tsv
}

migrate() {
  local backend_name
  backend_name=$(_outputs | jq -r '.backendName.value')
  echo "==> Running migrate + createcachetable..."
  az containerapp exec \
    --resource-group "$RG" \
    --name "$backend_name" \
    --command "python manage.py migrate --noinput && python manage.py createcachetable django_cache || true"
}

logs() {
  local backend_name
  backend_name=$(_outputs | jq -r '.backendName.value')
  az containerapp logs show \
    --resource-group "$RG" \
    --name "$backend_name" \
    --follow
}

smoke() {
  local backend_fqdn
  backend_fqdn=$(_outputs | jq -r '.backendFqdn.value')
  echo "==> GET https://$backend_fqdn/healthz"
  curl -sS "https://$backend_fqdn/healthz"
  echo
}

usage() {
  cat <<USAGE
OLAF deploy orchestrator. Subcommands:

  provision   one-time: register providers, create RG, deploy Bicep
  build       docker buildx + push to ACR
  release     roll Container App revision to the latest pushed image
  migrate     run manage.py migrate + createcachetable in the live container
  logs        tail backend logs
  smoke       hit /healthz on the live URL

Environment overrides:
  OLAF_RG, OLAF_LOCATION, OLAF_GITHUB_REPO, OLAF_GITHUB_BRANCH, OLAF_TAG
USAGE
}

case "${1:-}" in
  provision) provision ;;
  build)     build ;;
  release)   release ;;
  migrate)   migrate ;;
  logs)      logs ;;
  smoke)     smoke ;;
  *)         usage; exit 1 ;;
esac
