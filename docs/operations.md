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

## Extern fetcher i Docker

Produkters browser-rendering körs som Docker-containern `produkter-fetcher`.
Kanonisk driftfil är `scraper/fetcher/compose.yml`; full runbook finns i
[`scraper/fetcher/README.md`](../scraper/fetcher/README.md).

Hosten behöver endast Docker/Compose, utgående HTTPS och en konfigurerad
`INGEST_API_KEY` för engine-API:t. Fetchern exponerar ingen inbound port och har ingen lokal
canonical state.

Normal start:

```bash
cd scraper/fetcher
cp .env.example .env
# sätt INGEST_API_KEY lokalt i .env
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 produkter-fetcher
```

Vid byte från en annan renderingsimplementation ska Docker-fetchern verifieras
med ett riktigt lease/result-flöde innan den tidigare renderaren stängs av.

Vid hostbyte:

1. verifiera att engine nås från den nya hosten,
2. verifiera credential via fetcherns lease-anrop,
3. kör minst ett renderjobb och verifiera accepterat resultat,
4. stoppa gammal fetcher innan concurrency ökas på den nya hosten.

## Incidenter

Om fetchern försvinner ska canonical D1-state lämnas intakt. Åtgärda host/fetcher och låt lease-expiry återställa arbetsflödet.

Om queue/processor felar: verifiera queue backlog/retries och D1/R2-state före manuell omkörning.

## Credentials

Secrets hör hemma i Cloudflare secrets/runtime eller hostens säkra runtimekonfiguration. Dokumentera namn och ansvar, aldrig värden.

## Observability

Behåll query-string-redaction och central samplingpolicy. Lägg inte till tail consumers eller externa observability-destinations som repo-lokal genväg utan separat central policyändring.
