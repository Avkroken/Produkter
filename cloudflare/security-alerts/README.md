# Security alerts

Central event-driven receiver for GitHub organization webhooks.

`POST https://security-alerts.denied.se/webhook` accepts GitHub `code_scanning_alert` and `dependabot_alert` events, verifies `X-Hub-Signature-256`, and creates an Issue in the affected Avkroken repository when:

- Code Scanning severity is Medium, High, or Critical;
- Dependabot vulnerability severity is Medium, High, or Critical;
- Dependabot classification is malware, regardless of severity.

Issues are deduplicated by alert type and alert number.

## Runtime secrets

Set these on the existing Cloudflare Worker `security-alert-ingest`:

- `GITHUB_WEBHOOK_SECRET` — shared secret configured on the Avkroken organization webhook.
- `GITHUB_TOKEN` — fine-grained GitHub token with access to the Avkroken repositories and repository permissions `Issues: Read and write` and `Dependabot alerts: Read`.

## Organization webhook

Configure one webhook on `Avkroken`:

- Payload URL: `https://security-alerts.denied.se/webhook`
- Content type: `application/json`
- Secret: the same value as `GITHUB_WEBHOOK_SECRET`
- Events: `Code scanning alerts` and `Dependabot alerts`
- Active: enabled

Per-repository polling/snapshot workflows are not used.
