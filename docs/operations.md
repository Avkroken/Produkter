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

Verifiera app, engine och processor mot de genererade `wrangler.production.jsonc`-filerna. De är deployment-state och ska inte committas. De versionsstyrda `wrangler.jsonc`-filerna använder de anslutna production-Worker-namnen som Workers Builds kräver men innehåller ingen installationsspecifik production-state. Direkt lokal deploy via tracked production-config blockeras; lokala/explicita previews använder `wrangler.preview.jsonc` med separata `*-preview`-namn. På `main` läser `guard-portable-deploy.mjs` live Worker-state och custom domains via befintlig Wrangler-auth, backfyller vid behov endast saknade kontraktsbindings från senaste kompletta faktiskt deployade historiska Worker-version och kör en inre generated production-deploy. Workers Builds yttre production-deploy matchas sedan av Cloudflare till den anslutna production-Workern; tracked config sätter `keep_vars`, full `unsafe.metadata.keep_bindings` för vars/secrets/D1/KV/R2/Queue/Service/AI och samma observability-inställningar, så den yttre deployen bevarar den kompletta state som den inre deployen just verifierat. Den externa fetcherns `<engine-host>/jobs/*` fångas av en mer specifik Worker Route till app-Workern innan engine-Custom-Domain, så befintlig `ENGINE_URL` fungerar även när engine-Workern skyddas av interaktiv Cloudflare Access. App-ingressen verifierar samma `INGEST_API_KEY` och vidarebefordrar endast lease/result-rutterna via den befintliga `ENGINE` Service Binding. Övrig engine-trafik fortsätter till engine-Workern och dess Access-skydd. App, engine och processor exponerar inte production via `workers.dev`. Icke-main builds använder Worker Previews/Preview command och promoveras inte till production.

För manuell/self-hosted drift kan `cloudflare/deployment.json` eller `CLOUDFLARE_DEPLOYMENT_CONFIG` fortfarande generera `wrangler.production.jsonc` via `configure.mjs`. Cloudflare Workers Builds på `main` behöver ingen provider-side triggerändring: den inre deployen reparerar/verifierar live-state och den yttre deployen bevarar samtliga relevanta bindingtyper server-side via upload-metadata. Inga resurser auto-provisioneras eller ändras av discovery-steget. De tre Workers Builds-checkarna ska därför behandlas som vanliga blocking checks och är inte undantagna i `.github/release-ignored-checks`.

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
