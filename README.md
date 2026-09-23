# Produkter

Produkter är Avkrokens produkt-/datainsamlingssystem. Cloudflare ansvarar för webbapp, API, state, köer och bearbetning medan browser-rendering körs i en separat stateless Playwright-fetcher utanför Cloudflare Browser Run.

## Produktionsdelar

- **App Worker `produkter`** — `produkter.denied.se`, UI/API, auth/sessioner, uploads och jobbproducering.
- **Engine Worker `produkter-motor`** — schemaläggning, jobb/lease-kontrakt och AI-relaterad bearbetning.
- **Processor Worker `produkter-bearbetare`** — konsumerar `produkter-jobb` och arbetar mot gemensam state.
- **D1 `produkter`** — canonical persistent application state.
- **R2 `produkter-uppladdningar`** — uploads/objekt.
- **KV `SESSIONS`** — sessionsstate för appen.
- **Extern Playwright-fetcher** — leasar renderjobb från engine, renderar lokalt och postar resultat tillbaka.

Cloudflare Browser Run ingår uttryckligen inte i Produktions topology för Produkter.

## Dokumentation

- [Projektkontext](docs/project-context.md)
- [Arkitektur](docs/architecture.md)
- [Drift](docs/operations.md)
- [Extern render-fetcher](scraper/fetcher/README.md)
- [Avkrokens dokumentationsstandard](https://github.com/Avkroken/.github/blob/main/docs/documentation-standard.md)

## Verifiering

Appen har verifieringsscript för tester, JavaScript-syntax, TypeScript och Wrangler dry-run:

```bash
cd cloudflare/app
npm ci
npm run validate
```

Övriga Worker-delar har egna package-/Wrangler-konfigurationer och ska verifieras mot respektive deploymentconfig före merge.

## Säkerhet

Secrets och providercredentials sätts i runtime/Cloudflare och får inte committas eller återges i dokumentation. Rapportera sårbarheter privat enligt [SECURITY.md](SECURITY.md).
