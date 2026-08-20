# fetcher — statslös Playwright-muskel

Allt som blir kvar på servern i den enhetliga arkitekturen
(se `cloudflare/DESIGN.md`). Håller ingen data, ingen
inkommande port, ingen DB — bara utgående HTTPS mot `engine`-Workern:

```
lease N jobb  ->  rendera med Playwright  ->  posta tillbaka titel/pris/source_text
```

Dör servern redeployas den här loopen var som helst med två miljövariabler.
All durabel data ligger i D1 på Cloudflare.

## Köra

```bash
pip install -r requirements.txt
playwright install chromium

export ENGINE_URL="https://motor.denied.se"
export INGEST_API_KEY="<operatörsnyckeln>"
python fetcher/fetcher.py
```

Eller via den befintliga scraper-imagen (har redan Playwright + requests):

```bash
docker run --rm -e ENGINE_URL=... -e INGEST_API_KEY=... \
  ghcr.io/blixten85/scraper:latest python /app/fetcher/fetcher.py
```

## Miljövariabler

| Variabel | Default | Beskrivning |
|---|---|---|
| `ENGINE_URL` | — | bas-URL till engine-Workern (krävs) |
| `INGEST_API_KEY` | — | X-API-Key (krävs) |
| `FETCHER_CONCURRENCY` | 3 | parallella renderingar |
| `LEASE_BATCH` | 10 | jobb per lease |
| `POLL_IDLE_SEC` | 15 | vila när kön är tom |
| `RENDER_WAIT_MS` | 12000 | max väntan på client-side-innehåll |
| `HEADLESS` | 1 | `0` för synlig browser |

## Status

Fas 2: hanterar `detail`-jobb (produktsidor → titel/pris/source_text).
`list`-jobb (discovery-crawl) tillkommer senare; då utökas lease-svaret med
list-selektorerna.
