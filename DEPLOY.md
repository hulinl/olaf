# OLAF — production deploy runbook

Production lives on Azure in resource group `olaf-prod` / region `westeurope`,
under subscription **Předplatné Azure 1** (tenant `bifactory.cz`).

| Component | Resource | URL |
|---|---|---|
| Frontend | `Microsoft.Web/staticSites olaf-frontend` | https://olaf.events, https://www.olaf.events |
| Backend | `Microsoft.App/containerApps olaf-api` | https://api.olaf.events |
| Database | `Microsoft.DBforPostgreSQL/flexibleServers olaf-pg-*` | private |
| Image registry | `Microsoft.ContainerRegistry/registries olafacr*` | `olafacr*.azurecr.io/olaf-api` |
| Email (transactional) | `Microsoft.Communication/CommunicationServices olaf-comm` + EmailService `olaf-email` | sender `noreply@olaf.events` |
| Media (uploads) | `Microsoft.Storage/storageAccounts olafmedia*` | container `media`, public-read blobs |
| DNS | `Microsoft.Network/dnsZones olaf.events` | NS at webglobe point at `ns*-08.azure-dns.*` |

All defined in `infra/main.bicep` and orchestrated by `infra/deploy.sh`.

V1 deliberately **does not** provision Redis or a worker Container App —
Celery runs in eager (synchronous) mode and email send adds ~300ms to RSVP
requests. This keeps idle cost at ~€19/mo. When RSVP volume warrants it,
add `Microsoft.Cache/Redis` (Basic C0 ~€16/mo) + a worker Container App
(~€2/mo) and flip `CELERY_TASK_ALWAYS_EAGER` off in `settings_prod.py`.

---

## Prerequisites

- `az` CLI logged in (`az login`) on the subscription above
- `gh` CLI logged in (for SWA workflow inspection)
- Docker daemon running locally (for `buildx --platform linux/amd64`)
- Domain `olaf.events` registered at webglobe; NS records there will be
  pointed at the four `ns*-08.azure-dns.*` servers Azure assigns after the
  first provision.

Repo: https://github.com/hulinl/olaf. The Static Web App is wired to
push-on-`main`, so a git push redeploys the frontend. The backend image
is pushed and released manually via `deploy.sh`.

---

## First deploy

```bash
# 1. provision Azure resources (≈ 10 min)
./infra/deploy.sh provision

# 2. capture DNS verification tokens that Azure printed and stash them in
#    infra/main.bicep params (swaApexValidationToken, swaWwwValidationToken,
#    caBackendVerificationId, acsDomainVerificationId), then re-provision.

# 3. point NS records at webglobe to the four ns*-08.azure-dns.* hosts.
#    Wait for propagation (`dig NS olaf.events`).

# 4. build + push backend image
./infra/deploy.sh build

# 5. swap Container App to the real image
./infra/deploy.sh release

# 6. smoke
./infra/deploy.sh smoke
```

## Day-to-day commands

```bash
./infra/deploy.sh build     # build & push backend image
./infra/deploy.sh release   # roll Container App to new revision
./infra/deploy.sh logs      # tail backend logs
./infra/deploy.sh smoke     # GET /healthz
curl -I https://olaf.events # frontend
```

Frontend deploys automatically on push to `main`. Inspect builds with:

```bash
gh run list -R hulinl/olaf --limit 3
gh run view -R hulinl/olaf <run-id> --log-failed
```

---

## Email — sender domain

`noreply@olaf.events` is verified at the ACS Email Domain resource. SPF +
DKIM + DKIM2 + DMARC live in the Azure DNS zone for `olaf.events`. After
a DNS-zone re-provision, sanity-check verification:

```bash
az rest --method get \
  --url "https://management.azure.com/subscriptions/$(az account show --query id -o tsv)/resourceGroups/olaf-prod/providers/Microsoft.Communication/emailServices/olaf-email/domains/olaf.events?api-version=2023-04-01" \
  --query 'properties.verificationStates'
```

All four (Domain, SPF, DKIM, DKIM2) should be `Verified`.

---

## Rollback

Container Apps keeps the previous revisions around:

```bash
az containerapp revision list -g olaf-prod -n olaf-api \
  --query "[].{name:name,active:properties.active,traffic:properties.trafficWeight}" -o table

# pin 100% to an older revision
az containerapp ingress traffic set -g olaf-prod -n olaf-api \
  --revision-weight olaf-api--0000007=100
```

Frontend rollback: revert the bad commit on `main` and let the SWA
workflow rebuild.

---

## Costs (steady state, V1)

| | €/month |
|---|---|
| Postgres B1ms + 32 GB storage | ~12 |
| Container Registry Basic | ~4 |
| Container Apps Consumption (1 idle replica, 0.5 vCPU / 1 GB) | ~2 |
| Static Web App | 0 (Free tier) |
| Communication Services Email (low volume) | ~0 |
| Storage Account (Standard_LRS) | ~0.5 |
| DNS Zone | ~0.5 |
| **Total at idle** | **~19** |

Growth drivers: Postgres tier (B1ms → B2s when busy), Container Apps
replica scale-out (billed by vCPU-second). Adding back Redis + a worker
is ~€18 extra.

---

## Known gotchas

1. `containerapp update --image <tag>` is a **no-op** if the tag string
   hasn't changed. `deploy.sh release` uses `--image <repo>@sha256:<digest>`
   to force a new revision when re-pushing the same tag.
2. `az containerapp exec` needs a TTY and fails in CI; init logic belongs
   in `entrypoint.sh`, not `deploy.sh migrate` (which is for one-off
   investigations).
3. ACS rejects `"Display Name <addr>"` formatted senders. Keep
   `DEFAULT_FROM_EMAIL=noreply@olaf.events` (bare); display name lives
   on the SenderUsername resource (`displayName: olaf`).
4. The custom-domain TXT validation tokens (apex / www SWA, asuid.api,
   ACS ownership) aren't known until each resource is first created —
   first provision will fail to attach domains; capture the tokens from
   the SWA/Container App/ACS portal panes, paste them into `main.bicep`
   parameters, and re-provision.
