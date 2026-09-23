# Drift

## Repositoryverifiering

App:

```bash
cd cloudflare/app
npm ci
npm run validate
```

`validate` kör tester, syntaxkontroll för browserkoden, TypeScript typecheck och Wrangler dry-run.

Engine och processor ska verifieras från respektive katalog med deras package scripts och samma Wrangler-konfiguration som används vid deploy.

## Deploymentgräns

Dokumentations- eller kodverifiering ska inte implicit deploya produktion. Production deploy ska använda respektive Workers faktiska Wrangler-config.

## Extern fetcher

Fetchern ska köras under hostens normala supervisor/service manager. Runtime behöver:

- `ENGINE_URL`,
- `INGEST_API_KEY`,
- eventuella dokumenterade concurrency-/timingvariabler från `fetcher.py`.

Vid hostbyte:

1. verifiera att engine health nås från nya hosten,
2. verifiera credential mot lease-endpoint,
3. kör ett testjobb och verifiera accepterat resultat,
4. stoppa gammal process innan concurrency ökas på den nya hosten.

## Incidenter

Om fetchern försvinner ska canonical D1-state lämnas intakt. Åtgärda host/fetcher och låt lease-expiry återställa arbetsflödet.

Om queue/processor felar: verifiera queue backlog/retries och D1/R2-state före manuell omkörning.

## Credentials

Secrets hör hemma i Cloudflare secrets/runtime eller hostens säkra runtimekonfiguration. Dokumentera namn och ansvar, aldrig värden.

## Observability

Behåll query-string-redaction och central samplingpolicy. Lägg inte till tail consumers eller externa observability-destinations som repo-lokal genväg utan separat central policyändring.
