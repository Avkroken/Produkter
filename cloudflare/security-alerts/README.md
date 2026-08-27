# Security alerts

Central event-driven receiver for security alerts in the Avkroken organization.

`POST https://security-alerts.denied.se/webhook` accepts organization webhook events for `code_scanning_alert`, `dependabot_alert`, and `secret_scanning_alert`, verifies `X-Hub-Signature-256`, and creates an Issue in the affected Avkroken repository when:

- Code Scanning severity is Medium, High, or Critical;
- Dependabot vulnerability severity is Medium, High, or Critical;
- Dependabot classification is malware, regardless of severity;
- a Secret Scanning alert is created or reopened. The detected secret itself is never copied into the Issue.

Issues are deduplicated by alert type and alert number. No personal access token is used. The organization webhook is only the event source. The Worker authenticates separately as the Gamnacken GitHub App, looks up Gamnacken's installation on `Avkroken` with an app JWT, exchanges that installation ID for a short-lived installation access token, and uses that token to create Issues and read alert metadata.

This receiver is event-driven. GitHub does not replay existing security alerts when the Worker is deployed or when a webhook subscription is enabled. Existing alerts therefore require a separate backfill/sync mechanism if they should also become Issues.

## Organization webhook

Configure the webhook under `Avkroken` → Settings → Webhooks:

- URL: `https://security-alerts.denied.se/webhook`
- Content type: `application/json`
- Secret: a random secret shared with `SECURITY_ISSUE_WEBHOOK_SECRET`
- Active: enabled
- Events: `Code scanning alerts`, `Dependabot alerts`, and `Secret scanning alerts`

GitHub currently supports all three event types for organization webhooks.

Do not also send the same security alert events from the Gamnacken GitHub App webhook to this endpoint. If both webhook sources deliver the same event, the Worker will normally deduplicate the resulting Issue, but the duplicate delivery is unnecessary.

## GitHub App

Gamnacken is used for GitHub API authentication, not as the security-event source. It should be installed on `Avkroken` with access to all repositories that should receive security Issues.

Required repository permissions:

- `Issues`: Read & write
- `Dependabot alerts`: Read-only
- `Code scanning alerts`: Read-only
- `Secret scanning alerts`: Read-only

The Worker does not depend on an `installation` field in the organization webhook payload. Instead, it uses its App JWT to call GitHub's authenticated-app organization installation endpoint and resolves the Gamnacken installation dynamically.

## Cloudflare runtime configuration

Set these on the existing Worker `security-alert-ingest`:

- `SECURITY_ISSUE_WEBHOOK_SECRET` — Secret; same value as the Avkroken organization webhook secret.
- `SECURITY_ISSUE_APP_ID` — the Gamnacken GitHub App ID.
- `SECURITY_ISSUE_APP_PRIVATE_KEY` — Secret; the app private key in unencrypted PKCS#8 PEM format.

GitHub downloads new App private keys as PKCS#1 PEM. Convert it locally before storing it in Cloudflare:

```bash
openssl pkcs8 -topk8 -nocrypt -in downloaded-app-key.pem -out github-app-key-pkcs8.pem
```

Store the complete contents of `github-app-key-pkcs8.pem` as `SECURITY_ISSUE_APP_PRIVATE_KEY`. Never commit either private-key file.

`GITHUB_TOKEN` is not used.

Per-repository polling/snapshot workflows are not used.
