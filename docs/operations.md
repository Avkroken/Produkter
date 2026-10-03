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

Kopiera först `cloudflare/deployment.example.json` till den gitignorerade `cloudflare/deployment.json` och ange installationens egna domäner/resurs-ID:n. Generera sedan lokala Wrangler-filer:

```bash
node cloudflare/scripts/configure.mjs
```

Verifiera app, engine och processor mot de genererade `wrangler.production.jsonc`-filerna. De är deployment-state och ska inte committas. De versionsstyrda `wrangler.jsonc`-filerna använder canonical Worker-namn men innehåller inga provider-resurs-ID:n eller secretvärden. Production-bindings är endast `inherit`-referenser till `latest`; Preview-state hålls separat av Worker Previews. `guard-portable-deploy.mjs` håller Preview fail-closed: på andra brancher än `main` gör hooken ingen production-deploy. På `main` läser hooken Worker settings-state och custom domains via befintlig Wrangler-auth. Om aktuell Worker-version har komplett D1/KV/R2/Queue/Service/AI- och runtime-var-konfiguration används den direkt. Om bindings har strippats läser hooken i stället, read-only, deployments-historiken och väljer den senaste kompletta Worker-version som faktiskt varit deployad. Befintliga live-bindings och live-`plain_text`-vars behålls; endast saknade kontraktsbindings backfylls från den deployade historiken. `secret_text` kopieras aldrig. Hooken genererar en temporär `wrangler.production.jsonc` med `keep_vars: true` och kör en inre production-deploy mot den. Det gör den nya kompletta versionen till `latest`; den yttre standarddeployen använder därefter endast `inherit`-bindings mot `latest`, inklusive secrets, utan att secretvärden eller resource-ID:n finns i Git.

För manuell/self-hosted drift kan `cloudflare/deployment.json` eller `CLOUDFLARE_DEPLOYMENT_CONFIG` fortfarande generera `wrangler.production.jsonc` via `configure.mjs`. Cloudflare Workers Builds på `main` behöver ingen provider-side triggerändring: build-hooken återanvänder befintlig provider-state från aktuell Worker-version och backfyller vid behov endast saknade bindings från senaste kompletta faktiskt deployade historiska Worker-version innan generated config deployas; den yttre Wrangler-deployen ärver sedan den kompletta `latest`-versionens binding-state server-side. Inga resurser auto-provisioneras eller ändras av discovery-steget. De tre Workers Builds-checkarna ska därför åter behandlas som vanliga blocking checks och är inte undantagna i `.github/release-ignored-checks`.

Migrationer ska behandlas som versionsstyrd stateförändring och inte som ad hoc-drift. Main-hooken blockerar automatiskt Workers Builds om committen ändrar `cloudflare/migrations/**`; sådana releaser måste gå via den explicita D1-capable releasevägen innan Worker-kod som kräver det nya schemat får deployas. Workers Builds kan checka ut repositoryt shallow; om `HEAD^` saknas hämtar hooken därför bounded history med `git fetch --no-tags --depth=2 origin <branch>` innan migrationsdiffen körs och failar fortsatt stängt om parent-committen inte går att verifiera.

### D1 data locality och read replication

App, engine och processor ska binda samma D1-databas. Om installationen använder EU-jurisdiction ska databasen skapas med `jurisdiction=eu`. Jurisdiction kan inte läggas till på en befintlig databas; replacement kräver därför verifierad export/import till en ny EU-databas före binding-cutover.

Cloudflare-runtime använder den gemensamma Sessions API-wrappern för D1. Read replication får därför vara `auto`; med EU-jurisdiction skapas repliker endast inom EU.

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
