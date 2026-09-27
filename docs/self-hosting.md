# Self-hosting

Repositoryt är en publik template. En installation ska använda egna konton, domäner, OAuth-appar och Cloudflare-resurser; installationsspecifika värden ska inte committas.

## 1. Lokal Docker-/appkonfiguration

Kopiera miljöfilen:

```bash
cp .env.example .env
```

Fyll i de värden du använder. Secrets ska endast finnas lokalt eller i respektive providers secret store.

För den externa render-fetchern:

```bash
cd scraper/fetcher
cp .env.example .env
```

Minimikrav:

```dotenv
ENGINE_URL=https://engine.example.com
INGEST_API_KEY=<samma värde som engine-Workerns INGEST_API_KEY>
```

Start:

```bash
docker compose up -d --build
cd ../..
```

## 2. Cloudflare deployment

Kopiera den enda versionsstyrda deployment-mallen:

```bash
cp cloudflare/deployment.example.json cloudflare/deployment.json
```

Fyll i egna värden för:

- publik app-URL och engine-URL;
- Worker-namn;
- D1-namn och D1-ID;
- R2 bucket;
- KV namespace-ID;
- Queue-namn;
- Turnstile site key (publik, inte secret);
- OAuth client-ID:n när OAuth används;
- mailavsändare/adminadress när mailfunktioner används;
- valfria publika stöd-/donationslänkar;
- valfritt GitHub-repo för automatisk felrapportering.

`cloudflare/deployment.json` är gitignorerad.

### Deploymentkälla

Den verifierade produktionsvägen för den här installationen är Wrangler. De tre Workers har ingen Workers Builds-/Git-trigger som ska bära installationskonfiguration.

Generatorn väljer i ordning:

1. `--example` för CI/test;
2. `CLOUDFLARE_DEPLOYMENT_CONFIG` om en extern CI/buildmiljö uttryckligen tillhandahåller samma JSON;
3. lokal `cloudflare/deployment.json`.

För normal Wrangler-deploy används den gitignorerade `cloudflare/deployment.json`. `CLOUDFLARE_DEPLOYMENT_CONFIG` är endast ett portabelt alternativ för framtida/external CI och ska inte läggas som Worker runtime-secret.

Generera Wrangler-konfigurationerna:

```bash
node cloudflare/scripts/configure.mjs
```

Det skapar lokala `cloudflare/*/wrangler.jsonc`. De är också gitignorerade och får inte användas som versionsstyrd produktionsstate.

För en **ny D1-databas**, initiera grundschemat en gång innan första app-deployen:

```bash
cd cloudflare/app
npx wrangler d1 execute DB --remote --file=../infra/schema.sql
cd ../..
```

Kommandot ovan är bara för en tom ny installation. Befintliga installationer ska använda repositoryts versionsstyrda migrations-/deployflöde och ska inte återköra hela grundschemat.

Deploya därefter Workers i den ordning som krävs av appens Service Binding:

```bash
cd cloudflare/engine
npm run deploy
cd ../processor
npm run deploy
cd ../app
npm run deploy
cd ../..
```

Engine måste finnas innan appen deployas eftersom appen binder `ENGINE` som Service Binding.

## 3. Secrets

Secret-värden hör inte hemma i `deployment.json`. Sätt dem i respektive Worker med Wrangler eller motsvarande providerflöde.

För ingest-nyckeln ska samma värde installeras på båda Workers. Kör respektive kommando och mata in samma nyckel när Wrangler frågar; skriv inte nyckeln i kommandoraden:

```bash
cd cloudflare/engine
npm run secret:set-ingest-key
cd ../app
npm run secret:set-ingest-key
cd ../..
```

För kryptering av per-konto-providerinställningar ska **samma** `PROVIDER_CONFIG_KEY` sättas på app och processor:

```bash
cd cloudflare/app
npm run secret:set-provider-key
cd ../processor
npm run secret:set-provider-key
cd ../..
```

Använd samma genererade värde i båda kommandona. Appen krypterar providerdata och processorn dekrypterar samma D1-rader.

Turnstile använder två värden: den publika `turnstile.siteKey` i `deployment.json` och `TURNSTILE_SECRET` som Worker-secret på appen.

### Befintlig Turnstile-widget

När installationen redan har en Turnstile-widget ska den återanvändas; skapa inte en ny widget och byt inte site key.

1. Lägg widgetens **Site Key** i den lokala, gitignorerade `cloudflare/deployment.json` under `turnstile.siteKey`.
2. Kontrollera widgetens hostname/mode mot den avsedda produktionen.
3. Innan widgetens secret återställs eller skrivs till Workern: verifiera exakt mål med `wrangler secret list` för app-Workern.
4. Hämta widgetens secret med Wrangler 4.109+ från ett separat, uttryckligen godkänt Wrangler-exemplar utanför projektets package-resolution. Secretvärdet får inte skrivas ut, läggas i kommandoradsargument, temporära filer, Git eller chatt.
5. Installera secretvärdet på app-Workern som `TURNSTILE_SECRET` via standardkommandot:

```bash
cd cloudflare/app
npm run secret:set-turnstile
cd ../..
```

Produktions-`TURNSTILE_HOSTNAMES` genereras från `appUrl` och får inte innehålla `localhost` eller `127.0.0.1`. Signup använder action `signup`; lösenordsåterställning använder `password_recovery`. Backend kräver lyckad Siteverify, rätt action och rätt hostname.

OAuth-knappar visas bara när både client ID och motsvarande client secret finns konfigurerade.

Exempel på secrets som kan behövas beroende på aktiverade funktioner:

- `INGEST_API_KEY` — samma värde ska sättas på **både app- och engine-Workern**;
- `PROVIDER_CONFIG_KEY` — samma värde ska sättas på **både app- och processor-Workern**;
- AI-providerkeys;
- OAuth client secrets;
- `TURNSTILE_SECRET`;
- `RESEND_API_KEY`;
- `GITHUB_ERROR_REPORT_TOKEN`.

## 4. Första administratören

En ny databas skapar vanliga användarkonton som `user`; ingen publik request får automatiskt admin-rättigheter.

1. Öppna den deployade appen och skapa det konto som ska vara första administratör.
2. Kör därefter bootstrap från app-katalogen med samma e-postadress:

```bash
cd cloudflare/app
npm run admin:bootstrap -- admin@example.com
cd ../..
```

Kommandot använder Wrangler/D1-behörigheten, vägrar om kontot inte finns och verifierar efteråt att rollen är `admin`. Ytterligare admins kan sedan hanteras via den skyddade admin-vyn.

## 5. Verifiering

Generisk konfiguration kan verifieras utan en riktig installation:

```bash
node cloudflare/scripts/configure.mjs --example
```

CI gör samma sak och kör dessutom en kontamineringskontroll som stoppar kända installationsspecifika värden från att återintroduceras.

För en riktig installation: generera från `deployment.json`, kör respektive components typecheck/test/dry-run, deploya Workers med Wrangler, konfigurera nödvändiga secrets och verifiera därefter de egna publika URL:erna. En extern CI kan alternativt tillhandahålla samma JSON via `CLOUDFLARE_DEPLOYMENT_CONFIG`.

```bash
cd cloudflare/app
npm run verify:production
cd ../engine
npm run verify:production
cd ../..
```

`verify:production` använder samma environment-first deployment-konfiguration som generatorn. Vid normal Wrangler-drift används den lokala gitignorerade `deployment.json`; extern CI kan använda `CLOUDFLARE_DEPLOYMENT_CONFIG`.
