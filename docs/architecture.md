# Arkitektur

## Översikt

```text
Files / browser
      |
      +--------------------+
      |                    |
      v                    v
 Python app/CLI          Scraper
      |                    |
      |                    +--> external fetcher/browser boundary
      |
      +--> ProviderChain
      |      +--> Anthropic
      |      +--> OpenAI
      |      +--> Gemini
      |      +--> Azure OpenAI
      |
      +<---- scraper API sync ---->
      
Cloudflare runtime:
  app <--> engine <--> processor
           |
        shared/state
```

Diagrammet visar ansvar, inte ett påstående om att alla komponenter körs i samma deployment.

## Python webbapp

`app.py` hanterar användarsession, filuppladdning, jobbstate och background processing.

Jobbflödet bevarar input/mellanresultat under bearbetning och kan pausa när providerkedjan är uttömd för att återupptas senare.

## CLI/sync

`main.py` har två huvudlägen:

- `run` — läs fil och skriv en resultatfil med beskrivning;
- `sync` — hämta produkter utan beskrivning från scraper-API och skriv tillbaka genererade resultat.

Sync använder scraper-API-key via environment eller file path.

## ProviderChain

Providerabstraktionen skiljer applikationslogiken från enskilda AI-leverantörer.

Konfigurationen består av:

- credentials,
- leverantörsspecifika extra fält,
- providerordning,
- modellval.

Providerkeys ska inte passera genom loggar eller outputfiler.

## Per-account providerconfig

`provider_config.py` lagrar config under account-specifika kataloger. Credentialblobs krypteras med Fernet när aktuell skrivväg används.

Det separerar användarkonfiguration från source code och från generell jobstate.

## Scraper boundary

Scrapern samlar in produktdata och exponerar API som synckomponenten använder.

Render-/browserfetching är en separat boundary. Den ska kunna utvecklas eller flyttas utan att provider- och beskrivningslogiken behöver känna till browserimplementationen.

## Cloudflare boundary

Cloudflare-koden är uppdelad i app, engine och processor. De ska beskrivas och deployas som separata runtimeenheter med egna Wrangler-bindings.

Shared code minskar duplication men ändrar inte ägarskapet för runtime state.

## Trust boundaries

- browser → Flask session/auth
- app → krypterad providerconfig
- app/CLI → externa AI-providers
- sync → scraper API med separat auth
- scraper → extern fetcher/browser
- Cloudflare Workers → respektive bindings/state

## Failure model

Ett providerfel är inte automatiskt ett scraperfel. Ett fetcherfel är inte automatiskt ett AI-providerfel. Incidenter ska först klassificeras efter subsystemgränsen så att fallback och retries inte körs i fel lager.
