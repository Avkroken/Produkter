# Release- och versionsstandard

**Senast verifierad:** 2026-09-27

Det här dokumentet gäller **Produkter-repositoryt**. Repositoryts egna dokument, workflows, taggar och GitHub Releases äger release- och versionskontraktet.

## Klassificering

Produkter är en **versionsbar produkt** med publicerad GitHub Release-historik.

Verifierad current provider-state 2026-09-27:

- senaste publicerade GitHub Release: `v1.4.5`;
- publicerad: 2026-09-07;
- releasen är varken draft eller prerelease;
- repositoryt har `.github/release.yml` för GitHubs genererade release notes.

GitHub Release och motsvarande SemVer-tagg är repositoryts officiella versionsankare.

## Versionsmodell

Repositoryt innehåller flera runtimeformer:

- Python-app/CLI;
- scraper/fetcher;
- Cloudflare `app`;
- Cloudflare `engine`;
- Cloudflare `processor`.

Ingen verifierad rootfil eller package-version på current `main` fungerar som en gemensam canonical produktversion för hela repositoryt. Subsystemens interna versionsfält får därför inte automatiskt behandlas som repositoryts GitHub Release-version.

Versionerade repositoryreleases använder:

```text
vMAJOR.MINOR.PATCH
```

Inför inte en ny global `version.txt` eller annan parallell versionskälla enbart för releaseautomation.

## Release är inte deployment

En GitHub Release är en versionspunkt, inte ett implicit deploymentkommando.

Produkter har flera runtime- och deployenheter. Cloudflare-app, engine och processor har egna Wrangler-kontrakt, och Python/Docker-delarna har separata driftsättningsvägar. Releaseflödet får därför inte skapa en ny parallell deploymentväg eller anta att en tagg ska deploya alla subsystem.

Deployment ska fortsatt följa respektive subsystems verifierade operationskontrakt.

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

Scope är valfri, exempelvis `app`, `engine`, `processor`, `scraper`, `providers`, `auth` eller `deps`.

`!` markerar breaking change:

```text
feat(api)!: replace product ingestion contract
```

Workflow `.github/workflows/pr-title.yml` validerar titeln på `pull_request`. Workflown använder inga secrets, checkar inte ut repositoryt och har `permissions: {}`.

## SemVer

Vid en versionerad repositoryrelease gäller normalt:

- breaking change → **major**;
- `feat` → **minor**;
- `fix` → **patch**;
- `docs`, `test`, `chore`, `ci` och `build` → normalt ingen release ensamma;
- `perf` och `refactor` bedöms efter faktisk produkt-/kompatibilitetseffekt.

Versionsnummer är inte deploymenträknare.

## När en release ska ske

Release sker kuraterat, inte på varje merge.

En release är motiverad när exempelvis:

- användar- eller operatörsrelevant funktionalitet är färdig;
- en fix behöver en officiell versionspunkt;
- ett delat data-, API- eller kompatibilitetskontrakt ändras;
- flera färdiga ändringar ska samlas till en begriplig produktrelease;
- en breaking förändring kräver en ny major-version.

Ren dokumentation, CI eller dependencyunderhåll behöver normalt ingen egen version om det saknas faktisk produkt-/konsumenteffekt.

## Nuvarande releaseflöde

Current `main` har verifierad GitHub Release-historik men ingen aktiverad Release Please- eller motsvarande release-PR-automation.

Det kuraterade kontraktet är därför:

```text
main changes
  -> Conventional Commit-kompatibla PR-titlar/squash commits
  -> ordinarie repository-CI
  -> välj SemVer-version utifrån faktisk releaseeffekt
  -> skapa immutable vMAJOR.MINOR.PATCH-tagg
  -> skapa GitHub Release
  -> deploya berörda subsystem separat enligt deras operationskontrakt
```

`.github/release.yml` kategoriserar GitHubs genererade release notes men skapar inte taggar eller Releases.

## Releaseautomation

Full releaseautomation är inte aktiverad av det här kontraktet.

En framtida release-PR-modell måste bevara:

- normal CI och review på release-PR:n;
- least-privilege write-identitet;
- inga nya onödiga PAT:ar;
- ingen breddning av read-only integrationer till release-write;
- ingen bypass av ruleset, status checks eller review;
- ingen automatisk deployment av alla repositoryts subsystem enbart därför att en release skapas.

Standard-`GITHUB_TOKEN`-beteende och efterföljande workflowtriggers ska verifieras mot aktuell GitHub-dokumentation innan automation införs.

## Changelog och release notes

GitHub Releases är canonical publicerad releasehistorik.

`.github/release.yml` är endast konfiguration för GitHubs genererade release notes. Inför inte en separat manuellt underhållen `CHANGELOG.md` som konkurrerande source of truth.

Om en versionsstyrd changelog senare införs ska den genereras som del av samma releaseprocess.

## Prereleases

Prerelease används endast vid ett konkret distributions- eller testbehov, exempelvis:

```text
v2.0.0-rc.1
```

Prerelease-status i GitHub Release är inte ett implicit deploymentsbeslut.

## Hotfix och rollback

Hotfix utgår normalt från aktuell `main` och använder `fix:` när förändringen är bakåtkompatibel.

Publicerade taggar flyttas eller skrivs inte om. Vid felaktig release:

1. korrigera eller revert:a via vanlig PR;
2. kör relevant verifiering för berörda subsystem;
3. skapa en ny korrigerande SemVer-version;
4. skapa ny tagg och GitHub Release;
5. deploya endast de subsystem som faktiskt ska uppdateras.

Ingen force-push eller tag history rewrite används.
