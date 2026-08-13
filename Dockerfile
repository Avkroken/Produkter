FROM python:3.14-slim@sha256:a7fb1e634c4a578f9e0bd6327f11a3cde11b7a9395f48e24360c0988bcc5c2bc

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# apt-get upgrade patchar bas-imagens paket vid varje bygge, i stället för att
# vänta på att python:3.14-slim byggs om uppströms. Utan det blir Trivy-grinden
# i ci.yml en blockad man inte kan åtgärda: fyndet är "åtgärdbart" för att en
# patch finns i Debians repo, men den når imagen först när uppströms hinner ikapp.
# Med detta hämtas patchen direkt och imagen är ren när den byggs.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# supervisor installeras med pip, inte apt. Debians supervisor-paket drar in
# en hel andra Python (python3.13 + dist-packages) som inget annat i imagen
# använder — 17 apt-paket som bara är angreppsyta och något att patcha.
# Med pip kör supervisor under imagens egen Python 3.14.
RUN pip install --no-cache-dir supervisor

RUN pip install --no-cache-dir -r requirements.txt

RUN playwright install-deps chromium

# pip tas bort ur den färdiga imagen. Inget kör pip i drift, och pip bär med
# sig egna vendrade kopior av bl.a. setuptools 70.3.0 och msgpack 1.1.2 —
# deklarerade i pip/_vendor/bom.cdx.json. Trivy läser den SBOM:en och
# rapporterar dem som installerade paket. Det var de fynden som fällde bygget,
# och de gick inte att nå: setuptools i /usr/local uppgraderas visserligen av
# raden ovan, men pips egen kopia ligger kvar, och msgpack är inte ens ett
# beroende till requirements.txt. Även senaste pip (26.2.1) vendrar samma
# versioner, så det går inte att uppgradera bort heller.
RUN python -m pip uninstall -y pip

COPY . .

RUN chmod +x entrypoint.sh

RUN groupadd -r appuser && useradd -r -g appuser -s /bin/sh appuser

RUN mkdir -p /ms-playwright /logs /tmp /credentials && \
    chown -R appuser:appuser /app /ms-playwright /logs /tmp /credentials

USER appuser

EXPOSE 3000 8000

ENTRYPOINT ["./entrypoint.sh"]

