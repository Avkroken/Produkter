# Security Policy

## Scope

This repository holds three parts of one product:

- **Root** — the Python app (web UI, extractors, provider failover)
- **`cloudflare/`** — the same product on Cloudflare Workers (`app`, `engine`, `processor`)
- **`scraper/`** — the webshop scraper that feeds product data into the chain

A vulnerability in any of them belongs here.

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | ✅ Yes    |

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public issue.

Use [GitHub's private reporting feature](https://github.com/blixten85/product-describer/security/advisories/new)
to report it confidentially.

You should receive a response within 48 hours. If the issue is confirmed, a
patch will be released as soon as possible.

## Security Best Practices

- Pass all secrets via environment variables or Wrangler secrets — never
  hardcode and never commit them
- Never commit `.env` files, the `config/` directory, or credentials
- Provider API keys (Anthropic, OpenAI, Gemini, Azure OpenAI) and
  `SCRAPER_API_KEY` are stored encrypted at rest; raw credentials must never
  be logged, echoed, or committed
- `PROVIDER_CONFIG_KEY` must stay secret and must match between
  `cloudflare/app/` and `cloudflare/processor/`
- Keep dependencies updated (Dependabot is enabled) and review automated
  dependency/security alerts before deploying
