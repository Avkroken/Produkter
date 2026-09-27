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

Bygg och starta:

```bash
docker compose up -d --build
```

Kontrollera status:

```bash
docker compose ps
docker compose logs --tail=100 produkter-fetcher
```

En normal uppstart ska logga att fetchern ansluter mot `ENGINE_URL` och börjar
polla efter jobb.

## Uppdatering

Efter att ny kod har hämtats:

```bash
git pull --ff-only
cd scraper/fetcher
docker compose build --pull
docker compose up -d
docker compose ps
docker compose logs --tail=100 produkter-fetcher
```

Containern använder `restart: unless-stopped`, vilket gör att den startar igen
efter Docker-/host-restart så länge den inte har stoppats manuellt.

## Stoppa/starta

```bash
docker compose stop
docker compose start
```

Ta ned containern utan att radera någon Cloudflare-state:

```bash
docker compose down
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

1. `docker compose ps` visar containern som running.
2. `docker compose logs` visar anslutning mot engine utan authfel.
3. Fetchern kan leasa minst ett jobb.
4. Ett renderresultat accepteras av engine.
5. Rendering fortsätter efter `docker compose restart produkter-fetcher`.

Först därefter ska Cloudflare-engine deployas med den Browser Run-fria
konfigurationen.

## Felsökning

Visa senaste loggar:

```bash
docker compose logs --tail=200 produkter-fetcher
```

Följ loggar:

```bash
docker compose logs -f produkter-fetcher
```

Vanliga fel:

- `ENGINE_URL och INGEST_API_KEY måste vara satta` → kontrollera lokal `.env`.
- HTTP 401/403 mot engine → credential saknas/är fel eller har ändrats.
- lease-fel → verifiera nätåtkomst till `engine.example.com`.
- Playwright/Chromium-fel efter imageändring → bygg om med
  `docker compose build --no-cache` och starta om.
- tom kö → normalt; fetchern väntar enligt `POLL_IDLE_SEC`.

## Säkerhetsgräns

- Lägg aldrig `INGEST_API_KEY` i Git.
- Exponera ingen hostport för fetchern.
- Lägg ingen canonical state eller databas i containern.
- Cloudflare Browser Run ska inte återinföras som fallback för Produkter.
