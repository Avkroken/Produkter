FROM python:3.14-slim@sha256:cea0e6040540fb2b965b6e7fb5ffa00871e632eef63719f0ea54bca189ce14a6

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# apt-get upgrade patchar bas-imagens paket vid varje bygge, i stället för att
# vänta på att python:3.14-slim byggs om uppströms. Utan det blir Trivy-grinden
# i ci.yml en blockad man inte kan åtgärda: fyndet är "åtgärdbart" för att en
# patch finns i Debians repo, men den når imagen först när uppströms hinner ikapp.
# Med detta hämtas patchen direkt och imagen är ren när den byggs.
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
# setuptools följer med bas-imagen och uppdateras INTE av apt-get upgrade —
# det är ett Python-paket, inte ett Debian-paket. Trivy fällde bygget på
# CVE-2025-47273 (HIGH) och CVE-2026-59890 (MEDIUM) i setuptools 70.3.0.
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

RUN pip install --no-cache-dir -r requirements.txt

RUN playwright install-deps chromium

COPY . .

RUN chmod +x entrypoint.sh

RUN groupadd -r appuser && useradd -r -g appuser -s /bin/sh appuser

RUN mkdir -p /ms-playwright /logs /tmp /credentials && \
    chown -R appuser:appuser /app /ms-playwright /logs /tmp /credentials

USER appuser

EXPOSE 3000 8000

ENTRYPOINT ["./entrypoint.sh"]

