# Produkter-fetcher i Docker

Produkter använder en separat, stateless Playwright-fetcher för browser-rendering.
Den är avsedd att köras som en Docker-container på en Linux-host.

Cloudflare är fortfarande control/state plane. Fetcherhosten lagrar ingen canonical
data och exponerar ingen applikationsport.

## Flöde

```text
Docker på renderhost
  produkter-fetcher
        |
        | POST /jobs/lease
        v
https://engine.example.com
        |
        | renderjobb
        v
Playwright/Chromium
        |
        | POST /jobs/:id/result
        v
Cloudflare Engine -> D1
```

Fetchern hanterar både `list`- och `detail`-jobb. Om containern är nere pausas
renderingen. Canonical data ligger kvar i D1 och utgångna leases kan återtas när
containern startar igen.

## Förutsättningar på hosten

Hosten behöver:

- Docker Engine,
- Docker Compose plugin (`docker compose`),
- utgående HTTPS till `engine.example.com`,
- din egen `INGEST_API_KEY`.

Ingen inbound port behöver öppnas.

## Första installation

Från repositoryt på hosten:

```bash
cd scraper/fetcher
cp .env.example .env
```

Fyll i din egen engine-URL och samma ingest-nyckel som du har satt som secret på din engine-Worker:

```dotenv
ENGINE_URL=https://engine.example.com
INGEST_API_KEY=<ditt-värde>
```

`.env` får inte committas.

Runtime-imagen publiceras från repositoryts `main`-gren till `ghcr.io/avkroken/produkter-fetcher:latest`. Compose drar den publicerade imagen; renderhosten behöver alltså inte bygga Playwright/Chromium lokalt. Endast `ENGINE_URL` och `INGEST_API_KEY` är obligatoriska runtimevärden.

`ENGINE_URL` pekar direkt på engine-hostnamnet. Om engine-Workern skyddas av Cloudflare Access ska fetcherns maskinrutter (`/jobs/lease` och `/jobs/*/result`) ha en explicit Access Bypass. De rutterna är fortfarande skyddade av `X-API-Key`, som engine verifierar mot den centrala Secrets Store-bindingen `INGEST_API_KEY_STORE`. `/health` är också avsiktligt publik för production-verifiering och returnerar endast hälsostatus; övriga engine-vägar behåller sitt Access-skydd. Engine exponeras inte på `workers.dev`.

Använd explicit `-f compose.yml` så att en host-global `COMPOSE_FILE` inte kan styra kommandot till en annan stack.

Dra och starta:

```bash
docker compose -f compose.yml pull
docker compose -f compose.yml up -d
```

Kontrollera status:

```bash
docker compose -f compose.yml ps
docker compose -f compose.yml logs --tail=100 produkter-fetcher
```

En normal uppstart ska logga att fetchern ansluter mot `ENGINE_URL` och börjar
polla efter jobb.

## Uppdatering

När en ny fetcher-image har publicerats:

```bash
cd scraper/fetcher
docker compose -f compose.yml pull
docker compose -f compose.yml up -d
docker compose -f compose.yml ps
docker compose -f compose.yml logs --tail=100 produkter-fetcher
```

`latest` följer aktuell publicerad `main`. Varje publicering får även en immutable tagg `sha-<commit>`. En fork eller installation som vill använda en annan image kan sätta valfria `FETCHER_IMAGE` i lokal `.env`; den variabeln behövs inte för normal Avkroken-drift.

Containern använder `restart: unless-stopped`, vilket gör att den startar igen
efter Docker-/host-restart så länge den inte har stoppats manuellt.

## Stoppa/starta

```bash
docker compose -f compose.yml stop
docker compose -f compose.yml start
```

Ta ned containern utan att radera någon Cloudflare-state:

```bash
docker compose -f compose.yml down
```

Ingen canonical produktdata ligger i containern.

## Konfiguration

Obligatoriska variabler:

- `ENGINE_URL` — normalt `https://engine.example.com`.
- `INGEST_API_KEY` — installationens operatorcredential som skickas som `X-API-Key`.

Tuning:

- `FETCHER_CONCURRENCY` — parallella renderingar, default `3`.
- `LEASE_BATCH` — jobb per lease, default `10`.
- `POLL_IDLE_SEC` — väntan när kön är tom, default `15`.
- `RENDER_WAIT_MS` — väntan på client-side-innehåll, default `12000`.
- `MAX_LIST_PAGES` — hårt sidtak per listjobb, default `60`.

Runtime-defaults för concurrency/timing ligger i fetchern och behöver normalt inte anges i Compose.
Lägg bara till en override i Compose när du faktiskt behöver avvika.

## Verifiering före Cloudflare-cutover

Produkter-engine ska inte deployas utan Browser Run förrän Docker-fetchern är
verifierad på hosten.

Kontrollera i denna ordning:

1. `docker compose -f compose.yml ps` visar containern som running.
2. `docker compose -f compose.yml logs` visar anslutning mot engine utan authfel.
3. Fetchern kan leasa minst ett jobb.
4. Ett renderresultat accepteras av engine.
5. Rendering fortsätter efter `docker compose -f compose.yml restart produkter-fetcher`.

Först därefter ska Cloudflare-engine deployas med den Browser Run-fria
konfigurationen.

## Felsökning

Visa senaste loggar:

```bash
docker compose -f compose.yml logs --tail=200 produkter-fetcher
```

Följ loggar:

```bash
docker compose -f compose.yml logs -f produkter-fetcher
```

Vanliga fel:

- `ENGINE_URL och INGEST_API_KEY måste vara satta` → kontrollera lokal `.env`.
- HTTP 401/403 mot engine → credential saknas/är fel eller har ändrats.
- lease-fel → verifiera nätåtkomst till `engine.example.com`.
- Playwright/Chromium-fel efter imageändring → kör
  `docker compose -f compose.yml pull` och återskapa containern med `docker compose -f compose.yml up -d --force-recreate`.
- tom kö → normalt; fetchern väntar enligt `POLL_IDLE_SEC`.

## Säkerhetsgräns

- Lägg aldrig `INGEST_API_KEY` i Git.
- Exponera ingen hostport för fetchern.
- Lägg ingen canonical state eller databas i containern.
- Cloudflare Browser Run ska inte återinföras som fallback för Produkter.
