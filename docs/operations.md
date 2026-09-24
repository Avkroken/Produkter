# Drift

## Python-verifiering

```bash
python -m pip install -r requirements.txt
pytest
```

Testerna täcker bland annat auth, extractors, providerconfig, providers, prompts, mainflöden, log safety och felrapportering.

## Docker

Validera Compose innan driftförändringar:

```bash
docker compose config
```

Starta webbappen enligt repositoryts Compose-modell och aktivera `sync`-profilen endast när kontinuerlig scraper-synk ska köras.

Persistent data ligger i separata volumes för uploads, outputs och config.

## Providerkonfiguration

Verifiera:

1. att master key finns i runtime;
2. att providerconfig skrivs/läses för rätt account;
3. att required extra fields finns för aktuell provider;
4. att provider order inte innehåller borttagna/okonfigurerade providers;
5. att logs aldrig innehåller credentialvärden.

## CLI

Filkörning:

```bash
python main.py run <input>
```

Scraper-synk:

```bash
python main.py sync
```

Använd `--watch` endast när processen ska loopa kontinuerligt.

## Scraper/fetcher

Scraperns egen verifiering finns under `scraper/tests/`.

För browser/render-fetcher: följ [fetcher-dokumentationen](../scraper/fetcher/README.md). Ändringar i browserdelen ska inte kräva att AI-providercredentials flyttas dit.

## Cloudflare

Verifiera varje deployenhet mot sin egen config:

- `cloudflare/app/wrangler.jsonc`
- `cloudflare/engine/wrangler.jsonc`
- `cloudflare/processor/wrangler.jsonc`

Migrationer ska behandlas som versionsstyrd stateförändring och inte som ad hoc-drift.

## Incidentklassificering

### Generering misslyckas

Kontrollera providerkedja, aktuell provider, quota/resume-state och output/jobstate.

### Input kan inte läsas

Kontrollera extractor för aktuellt filformat innan providerlagret felsöks.

### Sync kan inte läsa/skriva produkt

Kontrollera scraper URL/auth/API före AI-providerlagret.

### Scraping/rendering misslyckas

Isolera scraper/fetcher/browser boundaryn. Providerkeys och promptlogik är inte första felsökningspunkt.

### Cloudflare-del fallerar

Identifiera först vilken deployenhet som äger requesten eller state: app, engine eller processor.

## Credentials

Dokumentation och logs får aldrig innehålla providerkeys, scraper-API-keys, session secrets eller krypteringsnycklar.

## Observability

Logga subsystem, operation och feltyp men inte känsliga payloads. Det ska gå att avgöra om felet uppstod i input, provider, scraper/fetcher eller Cloudflare utan att dumpa användardata.
