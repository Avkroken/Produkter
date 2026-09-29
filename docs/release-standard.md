# Release- och versionsstandard

**Senast verifierad:** 2026-09-27

Det här dokumentet gäller **Produkter-repositoryt**. Repositoryts egna dokument, workflows, taggar och GitHub Releases äger release- och versionskontraktet.

## Klassificering

Produkter är en **versionsbar produkt**.

Verifierad GitHub Release-historik finns under [GitHub Releases](https://github.com/Avkroken/Produkter/releases). Senast verifierade publicerade release är `v1.4.5` från 2026-09-07.

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

`.github/scripts/semantic_release.py` bygger release notes från den validerade first-parent-historiken och grupperar ändringar efter Conventional Commit-typ, inklusive breaking changes och security-scope. `.github/workflows/release.yml` skickar exakt dessa notes till den GitHub Release som skapas för den verifierade SemVer-taggen.

GitHub Releases är den officiella versionerade releasehistoriken som Portalens Changelog får konsumera. Inför inte en separat manuellt underhållen changelog eller parallell generated-notes-modell som konkurrerande source of truth.

## Verifiering vid release

Minst ordinarie repository-CI för berörda subsystem ska vara grön innan en releasepunkt skapas.

Verifiering följer [operations.md](operations.md). Beroende på ändring omfattar den bland annat:

- Python-tester;
- Docker Compose-validering;
- scraper/fetcher-verifiering;
- Cloudflare app/engine/processor med respektive test/typecheck/Wrangler dry-run.

En releaseprocess får inte kringgå normala PR-checks eller repositoryskydd. `Validate semantic release` rapporteras på varje PR och merge-queue-körning och är ett required check tillsammans med de ordinarie repository-gates. Required status checks körs i strict mode mot aktuell `main`.

## Releaseautomation — current state

`.github/workflows/release.yml` äger repositoryts automatiska releaseflöde lokalt.

Efter merge till `main`:

1. ordinarie push-CI och container security körs på release-target SHA;
2. releasejobbet beräknar SemVer från validerad first-parent-historik och Conventional Commits;
3. inga releasevärdiga ändringar innebär ingen ny release;
4. releasevärdiga ändringar väntar på de checks som anges i `.github/release-required-checks`;
5. en immutable SemVer-tagg och GitHub Release skapas på exakt verifierad target-SHA;
6. release notes genereras som repositoryts canonical versionerade changelog.

Workflown använder repositoryts `GITHUB_TOKEN` med least privilege. Ingen separat PAT eller write-utökning av read-only GitHub App-integrationer behövs.

Release är inte deployment: GitHub Release-flödet skapar inte en parallell Cloudflare-deployväg och deployar inte flera subsystem enbart därför att en release publiceras.

Manuell `workflow_dispatch` är begränsad till `main` och används endast som kontrollerad SemVer-/prerelease-override inom samma verifieringsmodell.

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
