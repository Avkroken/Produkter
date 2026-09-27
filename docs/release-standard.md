# Release- och versionsstandard

**Senast verifierad:** 2026-09-27

Det här dokumentet gäller **Produkter-repositoryt**. Repositoryts egna dokument, workflows, taggar och GitHub Releases äger release- och versionskontraktet.

## Klassificering

Produkter är en **versionsbar produkt**.

Verifierad GitHub Release-historik finns på current provider-state. Senast verifierade publicerade release är `v1.4.5` från 2026-09-07.

GitHub Release och motsvarande SemVer-tagg är repositoryts officiella versionsankare:

```text
vMAJOR.MINOR.PATCH
```

## Ingen lokal global versionskälla

Repositoryt innehåller flera runtimeformer: Python-app/CLI, scraper/fetcher och tre separata Cloudflare-deployenheter.

Ingen verifierad repoövergripande lokal versionsfil motsvarar GitHub Release-versionen på current `main`.

Inför därför inte `version.txt`, root-packageversion eller annan parallell global versionskälla enbart för releaseautomation. Delkomponenters tekniska versionsfält är inte automatiskt repositoryts produktversion.

## Release är inte deployment

En GitHub tagg eller GitHub Release är en versionspunkt, inte en implicit produktionsdeployment.

Produkter har separata runtime- och driftgränser. Cloudflare app, engine och processor verifieras/deployas mot sina egna Wrangler-kontrakt, och Python-/Docker-/scraperdelarna har egna operationsflöden.

Releaseautomation får därför inte skapa en ny parallell deployväg eller implicit deploya flera subsystem enbart därför att en release skapas.

## PR-titlar och squash commits

Pull request-titlar ska följa Conventional Commits:

```text
<type>[optional scope][!]: <description>
```

Tillåtna typer:

- `feat`
- `fix`
- `perf`
- `refactor`
- `docs`
- `test`
- `build`
- `ci`
- `chore`
- `revert`

Scope är valfri och ska beskriva det berörda subsystemet, exempelvis `app`, `scraper`, `fetcher`, `cloudflare`, `engine`, `processor` eller `deps`.

`!` markerar breaking change:

```text
feat(api)!: replace product import contract
```

`.github/workflows/pr-title.yml` validerar titeln på vanlig `pull_request`. Workflown använder inga secrets, checkar inte ut repositoryt och har `permissions: {}`.

## SemVer

Vid en versionerad repositoryrelease gäller normalt:

- breaking change → **major**;
- `feat` → **minor**;
- `fix` → **patch**;
- `docs`, `test`, `chore`, `ci` och `build` → normalt ingen release ensamma;
- `perf` och `refactor` bedöms efter faktisk användar-, data- eller kompatibilitetseffekt.

Releaseversionen är inte en Worker-version, container-build eller deployräknare.

## När en release ska ske

Release sker kuraterat, inte på varje merge eller deployment.

En release är motiverad när exempelvis:

- användar- eller operatörsrelevant funktionalitet är färdig;
- en fix behöver en officiell versionspunkt;
- ett publikt data-/API-/kompatibilitetskontrakt ändras;
- flera färdiga ändringar ska samlas till en begriplig produktrelease;
- en breaking förändring kräver ny major-version.

Rent dokumentations-, test-, CI- eller dependencyunderhåll skapar normalt inte en egen produktversion om det saknas konkret konsumenteffekt.

## Release notes

`.github/release.yml` konfigurerar GitHubs genererade release notes-kategorier. Den skapar inte taggar eller GitHub Releases och är inte releaseautomation.

GitHub Releases är den officiella versionerade releasehistoriken som Portalens Changelog får konsumera. Inför inte en separat manuellt underhållen changelog som konkurrerande source of truth.

## Verifiering vid release

Minst ordinarie repository-CI för berörda subsystem ska vara grön innan en releasepunkt skapas.

Verifiering följer [operations.md](operations.md). Beroende på ändring omfattar den bland annat:

- Python-tester;
- Docker Compose-validering;
- scraper/fetcher-verifiering;
- Cloudflare app/engine/processor med respektive test/typecheck/Wrangler dry-run.

En releaseprocess får inte kringgå normala PR-checks eller repositoryskydd.

## Releaseautomation — current state

Current `main` har ingen verifierad Release Please- eller motsvarande release-PR-workflow.

Full releaseautomation aktiveras inte i detta arbete.

En framtida release-PR-modell måste bevara:

- normal CI/review på release-PR:n;
- least-privilege write-identitet;
- inga nya onödiga PAT:ar;
- ingen utökning av read-only GitHub App-integrationer till release-write;
- ingen koppling som automatiskt deployar flera subsystem enbart därför att en release-PR mergas.

Standard-`GITHUB_TOKEN`-beteende och efterföljande workflowtriggers måste verifieras mot aktuell GitHub-dokumentation innan automation införs.

Historiska Releases som har skapats av `gamnacken[bot]` bevisar inte current write-permission och används därför inte som grund för en ny write-arkitektur.

## Prerelease

Prerelease används endast vid konkret behov, exempelvis:

```text
v2.0.0-rc.1
```

Prerelease-status ska markeras i GitHub Release och får inte tolkas som implicit produktionsdeployment.

## Hotfix och rollback

Hotfix utgår normalt från aktuell `main` och använder `fix:` när förändringen är bakåtkompatibel.

Publicerade taggar flyttas eller skrivs inte om. Vid felaktig release:

1. korrigera eller revert:a via vanlig PR;
2. kör relevant verifiering;
3. skapa en ny korrigerande SemVer-version;
4. skapa ny tagg och GitHub Release;
5. deploya endast de subsystem där den korrigerade ändringen faktiskt ska till produktion.

Ingen force-push eller tag history rewrite används.
