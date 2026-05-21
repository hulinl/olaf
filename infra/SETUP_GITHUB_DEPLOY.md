# One-time setup: GitHub Actions → Container App auto-deploy

Setup the OIDC federated credential so the `Deploy API to Container
App` workflow can roll a new revision on every merge to `main`
without storing a long-lived service-principal secret.

Run these 4 commands once in your terminal (creates the SP, grants
RG-scoped Contributor, registers the federated credential bound to
this repo's `main` branch).

```bash
SUB=$(az account show --query id -o tsv)
RG=olaf-prod
REPO=hulinl/olaf

# 1. Create the service principal with Contributor on the resource
#    group only. NOT subscription-wide.
SP=$(az ad sp create-for-rbac \
  --name "olaf-github-deploy" \
  --role Contributor \
  --scopes "/subscriptions/$SUB/resourceGroups/$RG" \
  --query '{appId:appId,tenantId:tenant,objectId:id}' -o json)
APP_ID=$(echo "$SP" | jq -r .appId)
TENANT_ID=$(echo "$SP" | jq -r .tenantId)
echo "appId=$APP_ID"
echo "tenantId=$TENANT_ID"
echo "subscriptionId=$SUB"

# 2. Add a federated credential — GitHub sends an OIDC token; Azure
#    accepts it only if the token says "this is the main branch of
#    $REPO".
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:'"$REPO"':ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'

# 3. (Optional but recommended) ACR push role — broader than the
#    RG-scoped Contributor needs, but explicit:
ACR_ID=$(az acr show --name olafacrftj67d --query id -o tsv)
az role assignment create \
  --assignee "$APP_ID" \
  --role AcrPush \
  --scope "$ACR_ID" >/dev/null
echo "ACR push role granted on $ACR_ID"
```

The first command prints `appId`, `tenantId`, and `subscriptionId`.
Add them to GitHub repo secrets:

  Repo Settings → Secrets and variables → Actions → New repository secret

  | Name                    | Value             |
  |-------------------------|-------------------|
  | `AZURE_CLIENT_ID`       | the `appId`       |
  | `AZURE_TENANT_ID`       | the `tenantId`    |
  | `AZURE_SUBSCRIPTION_ID` | your subscription |

Then the next merge to `main` that touches `apps/api/**` or
`infra/main.bicep` will auto-build + roll the Container App. The
`./infra/deploy.sh` script stays around for one-off operations
(`logs`, `smoke`, `provision`, manual `release`).

## Manual trigger

If you need to push the current `main` without changing API code
(e.g. you just want to redeploy):

  Actions tab → Deploy API to Container App → Run workflow → main
