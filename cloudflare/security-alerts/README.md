# Security alerts

Central event-driven receiver for the Avkroken GitHub App.

`POST https://security-alerts.denied.se/webhook` accepts GitHub App `code_scanning_alert`, `dependabot_alert`, and `secret_scanning_alert` events, verifies `X-Hub-Signature-256`, and creates an Issue in the affected Avkroken repository when:

- Code Scanning severity is Medium, High, or Critical;
- Dependabot vulnerability severity is Medium, High, or Critical;
- Dependabot classification is malware, regardless of severity;
- a Secret Scanning alert is created or reopened. The detected secret itself is never copied into the Issue.

Issues are deduplicated by alert type and alert number. No personal access token is used. The Worker authenticates as the GitHub App and exchanges a short-lived app JWT for an installation access token. GitHub installation access tokens expire after one hour.

This receiver is event-driven. GitHub does not replay existing security alerts when the Worker is deployed or when a webhook subscription is enabled. Existing alerts therefore require a separate backfill/sync mechanism if they should also become Issues.

## GitHub App

Create/install one GitHub App on `Avkroken`, with access to all repositories that should receive security issues.

Repository permissions:

- `Issues`: Read & write
- `Dependabot alerts`: Read-only
- `Code scanning alerts`: Read-only
- `Secret scanning alerts`: Read-only

Webhook:

- URL: `https://security-alerts.denied.se/webhook`
- Secret: a random secret shared with `SECURITY_ISSUE_WEBHOOK_SECRET`
- Active: enabled
- Events: `Code scanning alerts`, `Dependabot alerts`, and `Secret scanning alerts`

The webhook payload supplies the installation ID, so no installation ID is stored in Cloudflare.

## Cloudflare runtime configuration

Set these on the existing Worker `security-alert-ingest`:

- `SECURITY_ISSUE_WEBHOOK_SECRET` — Secret; same value as the GitHub App webhook secret.
- `SECURITY_ISSUE_APP_ID` — the GitHub App ID.
- `SECURITY_ISSUE_APP_PRIVATE_KEY` — Secret; the app private key in unencrypted PKCS#8 PEM format.

GitHub downloads new App private keys as PKCS#1 PEM. Convert it locally before storing it in Cloudflare:

```bash
openssl pkcs8 -topk8 -nocrypt -in downloaded-app-key.pem -out github-app-key-pkcs8.pem
```

Store the complete contents of `github-app-key-pkcs8.pem` as `SECURITY_ISSUE_APP_PRIVATE_KEY`. Never commit either private-key file.

`GITHUB_TOKEN` is no longer used and should be removed from the Worker after the GitHub App deployment is working.

Per-repository polling/snapshot workflows and a separate organization webhook are not used.
