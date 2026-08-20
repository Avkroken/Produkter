#!/usr/bin/env bash
set -euo pipefail

out="${GITHUB_OUTPUT:-/dev/stdout}"
python=false
node=false
all=false
docker_app=false
docker_scraper=false
base="${CI_BASE_SHA:-}"
head="${CI_HEAD_SHA:-${GITHUB_SHA:-HEAD}}"

# Manuella körningar och okänd diff verifierar allt.
if [[ "${GITHUB_EVENT_NAME:-}" == "workflow_dispatch" ]]; then
  all=true
  docker_app=true
  docker_scraper=true
elif [[ -z "$base" || "$base" =~ ^0+$ ]]; then
  all=true
  docker_app=true
  docker_scraper=true
elif ! git cat-file -e "${base}^{commit}" 2>/dev/null || ! git cat-file -e "${head}^{commit}" 2>/dev/null; then
  all=true
  docker_app=true
  docker_scraper=true
else
  changed="$(git diff --name-only --diff-filter=ACMRDTUXB "$base" "$head")"
  if [[ -z "$changed" ]]; then
    all=true
    docker_app=true
    docker_scraper=true
  fi

  while IFS= read -r file; do
    [[ -n "$file" ]] || continue
    case "$file" in
      # Dokumentation/processmetadata påverkar varken språkbyggen eller images.
      *.md|docs/*|AGENTS.md|CLAUDE.md|LICENSE|SECURITY.md|scraper/*.md|scraper/AGENTS.md|scraper/CLAUDE.md|scraper/CHANGELOG.md)
        ;;

      # Cloudflare Workers är Node/TypeScript och ingår inte i root-imagens
      # explicita COPY-lista.
      cloudflare/*)
        node=true
        ;;

      # Scraper har ett eget Docker-context. Bara runtime/config under scraper
      # påverkar scraper-imagen; dokumentation filtreras ovan.
      scraper/*)
        python=true
        docker_scraper=true
        ;;

      # Root-Python och templates är huvudimagen.
      *.py|requirements.txt|requirements-*.txt|pyproject.toml|setup.py|setup.cfg|templates/*)
        python=true
        docker_app=true
        ;;
      Dockerfile|.dockerignore)
        docker_app=true
        ;;

      # Ändringar i själva CI-routingen verifierar båda språken och båda
      # images innan routingen får betros.
      .github/scripts/ci-impact.sh)
        all=true
        docker_app=true
        docker_scraper=true
        ;;
      .github/workflows/ci.yml)
        all=true
        ;;
      .github/workflows/docker.yml|.github/actions/trivy/*|.github/actions/trivy/**)
        docker_app=true
        docker_scraper=true
        ;;

      # Compose ändrar orkestrering men inte imageinnehåll.
      docker-compose*.yml|docker-compose*.yaml)
        all=true
        ;;

      # Okänd CI/config påverkan kör språk-CI konservativt. Docker är däremot
      # explicit avgränsad av COPY-listor/context, så okända repo-filer kan inte
      # smyga in i images.
      .github/*|*.json|*.yaml|*.yml|*.toml|*.lock)
        all=true
        ;;
      *)
        all=true
        ;;
    esac
  done <<< "${changed:-}"
fi

if [[ "$all" == true ]]; then
  python=true
  node=true
fi

printf 'python=%s\nnode=%s\nall=%s\ndocker_app=%s\ndocker_scraper=%s\n' \
  "$python" "$node" "$all" "$docker_app" "$docker_scraper" >> "$out"
printf 'CI impact: python=%s node=%s all=%s docker_app=%s docker_scraper=%s\n' \
  "$python" "$node" "$all" "$docker_app" "$docker_scraper"
