// OLAF Phase-1 production stack — ported from hulinl/slotly infra/main.bicep.
//
// Provisions (single resource group, single Bicep deploy):
//   - PostgreSQL Flexible Server B1ms (managed, public access)
//   - Azure Container Registry Basic (private images)
//   - Container Apps environment + 1 Container App (backend / Django)
//   - Static Web App (frontend Next.js, Free tier, GitHub deploy)
//   - Communication Services + Email Communication Service (transactional
//     email via olaf.events sender domain, customer-managed)
//   - Storage Account (public-read `media` container — event covers,
//     gallery, block images, workspace logos)
//   - DNS Zone olaf.events with apex ALIAS to SWA, api CNAME to Container
//     App, ACS + SWA + Container App ownership/verification TXT records.
//
// OLAF specifics (vs Slotly):
//   - No Celery worker / Redis container — V1 runs tasks eager in-request
//     (~€16/mo savings, ~300ms RSVP latency tradeoff).
//   - Domain is olaf.events, sender noreply@olaf.events.
//   - Calendar URL encryption key is not needed.
//
// Idempotent: re-running with the same parameters updates in place.

@description('Azure region for everything.')
param location string = resourceGroup().location

@description('Postgres admin login.')
param postgresAdmin string = 'olafadmin'

@secure()
@description('Postgres admin password (must satisfy MS complexity rules).')
param postgresPassword string

@description('Database name created on the server.')
param postgresDatabase string = 'olaf'

@secure()
@description('Django SECRET_KEY (generate before deploying).')
param djangoSecretKey string

@description('Public origin where the frontend is served (canonical, used for email links + CORS).')
param frontendBaseUrl string = 'https://olaf.events'

@description('Comma-separated allowed CORS origins / CSRF trusted origins. Apex + www.')
param frontendAllowedOrigins string = 'https://olaf.events,https://www.olaf.events'

@description('GitHub repo URL for Static Web Apps source.')
param githubRepo string = 'https://github.com/hulinl/olaf'

@description('Branch SWA deploys from.')
param githubBranch string = 'main'

@description('GitHub PAT with repo + workflow scopes. Empty → skip SWA provisioning.')
@secure()
param githubToken string = ''

@description('Initial container image for the backend Container App. Real image is swapped in by deploy.sh release.')
param backendInitialImage string = 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'

@description('Link the customer-managed olaf.events domain to Communication Services. Must be false on first provision — the domain is created in pending-verification state and ACS rejects the link until it flips Verified. Flipped to true on 2026-05-18 after DKIM/SPF/Domain finished verifying.')
param linkCustomEmailDomain bool = true

// ---------------------------------------------------------------------------
// Globally-unique name suffix
// ---------------------------------------------------------------------------
var suffix = take(uniqueString(resourceGroup().id), 6)

var pgServerName = 'olaf-pg-${suffix}'
var acrName = 'olafacr${suffix}'
var storageName = 'olafmedia${suffix}'
var caEnvName = 'olaf-env'
var caBackendName = 'olaf-api'
var swaName = 'olaf-frontend'
var commName = 'olaf-comm'
var emailServiceName = 'olaf-email'

// ===========================================================================
// PostgreSQL Flexible Server (B1ms — cheapest managed tier ~€12/mo)
// ===========================================================================
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: pgServerName
  location: location
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: postgresAdmin
    administratorLoginPassword: postgresPassword
    storage: { storageSizeGB: 32, autoGrow: 'Disabled' }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
    highAvailability: { mode: 'Disabled' }
  }
}

resource pgFirewallAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgres
  name: 'allow-azure-services'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource pgDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: postgresDatabase
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

// ===========================================================================
// Azure Container Registry (Basic ~€4/mo)
// ===========================================================================
resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: true }
}

// ===========================================================================
// Blob Storage — user-uploaded media (event covers, gallery, block images,
// workspace logos). Public-read on the `media` container so the frontend
// can render <img src=...> directly.
// ===========================================================================
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    networkAcls: { defaultAction: 'Allow' }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {}
}

resource mediaContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'media'
  properties: { publicAccess: 'Blob' }
}

// ===========================================================================
// Communication Services + Email Service
// ===========================================================================
resource emailService 'Microsoft.Communication/EmailServices@2023-04-01' = {
  name: emailServiceName
  location: 'global'
  properties: { dataLocation: 'Europe' }
}

resource emailDomain 'Microsoft.Communication/EmailServices/Domains@2023-04-01' = {
  parent: emailService
  name: 'AzureManagedDomain'
  location: 'global'
  properties: { domainManagement: 'AzureManaged', userEngagementTracking: 'Disabled' }
}

// Customer-managed sender domain. Created pending-verification; flip to
// Verified after the DNS TXT records this resource exposes are in place.
resource emailCustomDomain 'Microsoft.Communication/EmailServices/Domains@2023-04-01' = {
  parent: emailService
  name: 'olaf.events'
  location: 'global'
  properties: { domainManagement: 'CustomerManaged', userEngagementTracking: 'Disabled' }
}

resource noreplySender 'Microsoft.Communication/EmailServices/Domains/SenderUsernames@2023-04-01' = {
  parent: emailCustomDomain
  name: 'noreply'
  properties: { username: 'noreply', displayName: 'olaf' }
}

resource comm 'Microsoft.Communication/CommunicationServices@2023-04-01' = {
  name: commName
  location: 'global'
  properties: {
    dataLocation: 'Europe'
    // First provision links only the Azure-managed sender domain — the
    // custom olaf.events domain is still pending verification at this point
    // and ACS rejects the link with DomainValidationError. After the TXT
    // records propagate and the domain flips Verified, re-run provision
    // with `linkCustomEmailDomain=true` to add it here.
    linkedDomains: linkCustomEmailDomain
      ? [ emailDomain.id, emailCustomDomain.id ]
      : [ emailDomain.id ]
  }
  // Bicep doesn't infer the dependency through linkedDomains[].id strings
  // (child of a different resource type), so without this ARM tried to
  // create `comm` before the Domain children existed and bailed with
  // ResourceNotFound. Explicit dependsOn forces the order.
  dependsOn: [
    emailDomain
    emailCustomDomain
  ]
}

// ===========================================================================
// Container Apps environment + backend
// ===========================================================================
resource caEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: caEnvName
  location: location
  properties: {
    appLogsConfiguration: { destination: 'azure-monitor' }
  }
}

resource caBackend 'Microsoft.App/containerApps@2024-03-01' = {
  name: caBackendName
  location: location
  properties: {
    managedEnvironmentId: caEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [
        { server: acr.properties.loginServer, username: acr.listCredentials().username, passwordSecretRef: 'acr-password' }
      ]
      secrets: [
        { name: 'acr-password', value: acr.listCredentials().passwords[0].value }
        { name: 'django-secret', value: djangoSecretKey }
        { name: 'pg-url', value: 'postgres://${postgresAdmin}:${postgresPassword}@${postgres.properties.fullyQualifiedDomainName}:5432/${postgresDatabase}?sslmode=require' }
        { name: 'acs-conn', value: comm.listKeys().primaryConnectionString }
        { name: 'storage-conn', value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=core.windows.net' }
      ]
    }
    template: {
      containers: [
        {
          name: 'django'
          image: backendInitialImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'DJANGO_SETTINGS_MODULE', value: 'olaf.settings_prod' }
            { name: 'DJANGO_DEBUG', value: 'False' }
            { name: 'DJANGO_ALLOWED_HOSTS', value: 'api.olaf.events,${caBackendName}.${caEnv.properties.defaultDomain}' }
            { name: 'FRONTEND_URL', value: frontendBaseUrl }
            { name: 'CORS_ALLOWED_ORIGINS', value: frontendAllowedOrigins }
            { name: 'CSRF_TRUSTED_ORIGINS', value: frontendAllowedOrigins }
            { name: 'COOKIE_DOMAIN', value: '.olaf.events' }
            { name: 'DJANGO_SECRET_KEY', secretRef: 'django-secret' }
            { name: 'DATABASE_URL', secretRef: 'pg-url' }
            { name: 'AZURE_COMMUNICATION_CONNECTION_STRING', secretRef: 'acs-conn' }
            { name: 'AZURE_STORAGE_CONNECTION_STRING', secretRef: 'storage-conn' }
            { name: 'AZURE_STORAGE_ACCOUNT_NAME', value: storage.name }
            { name: 'AZURE_STORAGE_CONTAINER_MEDIA', value: 'media' }
            { name: 'DEFAULT_FROM_EMAIL', value: 'noreply@olaf.events' }
          ]
        }
      ]
      scale: {
        minReplicas: 1   // one warm replica keeps first-request latency under control
        maxReplicas: 3
      }
    }
  }
  dependsOn: [ pgDatabase, pgFirewallAzure ]
}

// ===========================================================================
// Static Web Apps (Free tier — frontend Next.js)
//
// The actual SWA was provisioned via `az staticwebapp create
// --login-with-github` (no PAT needed; Azure installs its GitHub App
// through browser auth). The Bicep declaration below stays as a fallback
// in case anyone re-creates the resource from scratch with a PAT, but the
// hot path goes through the `existing` reference so the DNS records can
// point at the resource without depending on githubToken.
// ===========================================================================
resource swa 'Microsoft.Web/staticSites@2023-12-01' = if (!empty(githubToken)) {
  name: swaName
  location: 'westeurope'
  sku: { name: 'Free', tier: 'Free' }
  properties: {
    repositoryUrl: githubRepo
    branch: githubBranch
    repositoryToken: githubToken
    buildProperties: {
      appLocation: '/apps/web'
      apiLocation: ''
      outputLocation: '.next'
    }
  }
}

resource existingSwa 'Microsoft.Web/staticSites@2023-12-01' existing = {
  name: swaName
}

// ===========================================================================
// Azure DNS — owns olaf.events. Registration stays at webglobe; NS records
// there point at the four ns*-08.azure-dns.* servers Azure assigned.
// ===========================================================================
@description('SWA validation token for apex olaf.events (TXT _dnsauth). Refresh via az staticwebapp hostname show after first SWA deploy.')
param swaApexValidationToken string = '_qbxeossv4hrbdefonmfajzh9tc2umv5'

@description('SWA validation token for www.olaf.events (TXT _dnsauth.www).')
param swaWwwValidationToken string = '_q01n9z95w9tiviu04x0szlbh1jhmi07'

@description('Container App env customDomainVerificationId (TXT asuid.api).')
param caBackendVerificationId string = '11E901F8148387D9CC9786CD5B79BD7F096D4471C57C8A64EE778E84E5D99E21'

@description('ACS olaf.events domain ownership token (TXT @, ms-domain-verification=<this>).')
param acsDomainVerificationId string = 'd1bc357b-be37-499d-adc1-24179ed92eee'

resource dnsZone 'Microsoft.Network/dnsZones@2018-05-01' = {
  name: 'olaf.events'
  location: 'global'
  properties: { zoneType: 'Public' }
}

// --- Apex ALIAS to SWA. Uses `existingSwa` so it works regardless of
// whether SWA was provisioned via Bicep+PAT or via az CLI+browser auth.
resource apexAlias 'Microsoft.Network/dnsZones/A@2018-05-01' = {
  parent: dnsZone
  name: '@'
  properties: { TTL: 3600, targetResource: { id: existingSwa.id } }
}

// --- Apex TXT: ACS domain verification + SPF.
resource apexTxt 'Microsoft.Network/dnsZones/TXT@2018-05-01' = if (!empty(acsDomainVerificationId)) {
  parent: dnsZone
  name: '@'
  properties: {
    TTL: 3600
    TXTRecords: [
      { value: [ 'ms-domain-verification=${acsDomainVerificationId}' ] }
      { value: [ 'v=spf1 include:spf.protection.outlook.com -all' ] }
    ]
  }
}

resource dnsauthApex 'Microsoft.Network/dnsZones/TXT@2018-05-01' = if (!empty(swaApexValidationToken)) {
  parent: dnsZone
  name: '_dnsauth'
  properties: { TTL: 3600, TXTRecords: [ { value: [ swaApexValidationToken ] } ] }
}

resource dnsauthWww 'Microsoft.Network/dnsZones/TXT@2018-05-01' = if (!empty(swaWwwValidationToken)) {
  parent: dnsZone
  name: '_dnsauth.www'
  properties: { TTL: 3600, TXTRecords: [ { value: [ swaWwwValidationToken ] } ] }
}

resource asuidApi 'Microsoft.Network/dnsZones/TXT@2018-05-01' = if (!empty(caBackendVerificationId)) {
  parent: dnsZone
  name: 'asuid.api'
  properties: { TTL: 3600, TXTRecords: [ { value: [ caBackendVerificationId ] } ] }
}

resource dmarc 'Microsoft.Network/dnsZones/TXT@2018-05-01' = {
  parent: dnsZone
  name: '_dmarc'
  properties: {
    TTL: 3600
    TXTRecords: [ { value: [ 'v=DMARC1; p=none; rua=mailto:hulin@bifactory.cz' ] } ]
  }
}

resource cnameWww 'Microsoft.Network/dnsZones/CNAME@2018-05-01' = {
  parent: dnsZone
  name: 'www'
  properties: { TTL: 3600, CNAMERecord: { cname: existingSwa.properties.defaultHostname } }
}

resource cnameApi 'Microsoft.Network/dnsZones/CNAME@2018-05-01' = {
  parent: dnsZone
  name: 'api'
  properties: { TTL: 3600, CNAMERecord: { cname: caBackend.properties.configuration.ingress.fqdn } }
}

// --- DKIM CNAMEs for ACS olaf.events email.
resource dkim1 'Microsoft.Network/dnsZones/CNAME@2018-05-01' = {
  parent: dnsZone
  name: 'selector1-azurecomm-prod-net._domainkey'
  properties: { TTL: 3600, CNAMERecord: { cname: 'selector1-azurecomm-prod-net._domainkey.azurecomm.net' } }
}

resource dkim2 'Microsoft.Network/dnsZones/CNAME@2018-05-01' = {
  parent: dnsZone
  name: 'selector2-azurecomm-prod-net._domainkey'
  properties: { TTL: 3600, CNAMERecord: { cname: 'selector2-azurecomm-prod-net._domainkey.azurecomm.net' } }
}

// ---------------------------------------------------------------------------
// Outputs — consumed by deploy.sh
// ---------------------------------------------------------------------------
output postgresFqdn string = postgres.properties.fullyQualifiedDomainName
output postgresDatabaseName string = postgresDatabase
output postgresAdminLogin string = postgresAdmin

output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name

output backendFqdn string = caBackend.properties.configuration.ingress.fqdn
output backendName string = caBackend.name

output staticWebHost string = existingSwa.properties.defaultHostname
output staticWebName string = existingSwa.name

output emailSenderDomain string = emailDomain.properties.fromSenderDomain
output communicationServiceName string = comm.name

output dnsZoneName string = dnsZone.name
output dnsNameServers array = dnsZone.properties.nameServers
