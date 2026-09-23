# Arkitektur

## Översikt

```text
Browser / API client
        |
        v
 produkter.denied.se
   App Worker
   |   |   \
   |   |    +--> R2 uploads
   |   +-------> KV sessions
   +----------> D1 state
        |
        | Service Binding
        v
  produkter-motor
     Engine
   |    |     \
   |    |      +--> Workers AI
   |    +---------> D1
   |
   | lease/result over HTTPS
   v
External Playwright fetcher
   |
   | result
   v
 Engine / D1

App/Engine --> produkter-jobb --> Processor --> D1/R2
```

## Trust boundaries

### App -> Engine

Appen använder intern Service Binding för primär tjänstkoppling. Interna anrop ska inte kräva en ny parallell credentialmodell när Cloudflare service-to-service-bindingen räcker.

### External fetcher -> Engine

Fetchern är extern till Cloudflare-runtime och autentiserar sitt lease/result-kontrakt med befintlig ingest-credential. Credential-värdet ska aldrig läggas i repository, loggar eller dokumentation.

### Storage

- D1: canonical databasstate.
- R2: objekt/uploads.
- KV: sessionsrelaterad state.
- Queue: arbetsfördelning, inte canonical långtidssanning.

## Resilience

Fetcherhosten är disposable. Engine måste kunna återvinna utgångna leases. En fetcher får därför inte bära unik state som krävs för att systemet ska återhämta sig.

## Browser boundary

Browser automation finns i den externa fetchern. Cloudflare Browser Run är inte en fallback för Produkter.
