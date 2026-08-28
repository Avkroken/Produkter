# Flytande: `stable-slim` följer Debians nuvarande stable, `trixie-slim` gör
# det inte — den sitter kvar på trixie även när nästa stable släppts. En
# pinnad digest ovanpå det hade dessutom frusit även säkerhetsuppdateringarna
# tills Dependabot råkade bumpa den.
FROM debian:stable-slim

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Python, pip och supervisor kommer från Debian i stället för från
# python:3.14-slim. Skälet är underhållskedjan: Debians säkerhetsteam patchar
# dem, och apt-get upgrade nedan plockar upp rättningarna vid varje bygge.
# Med uppströms python-image väntar man i stället på att imagen byggs om.
#
# Det löser också fyndklassen som fällde bygget i augusti: uppströms pip bär
# med sig vendrade kopior av setuptools och msgpack och deklarerar dem i
# pip/_vendor/bom.cdx.json, som Trivy läser som installerade paket. Debians
# python3-pip vendrar samma bibliotek men skickar ingen SBOM — och patchar
# dem via apt.
#
# Priset är Python 3.13 i stället för 3.14, vilket trixie ger. playwright
# stödjer 3.10–3.14, så det är inget hinder.
RUN apt-get update && apt-get full-upgrade -y && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    supervisor \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
# PEP 668: Debians Python är externally-managed. Appens PyPI-beroenden hör inte
# hemma i Debians pakethantering och installeras därför uttryckligen vid sidan
# av — de bevakas i stället av Dependabot via requirements.txt.
# Appens beroenden i ett eget träd. Debians Python-paket får inte ersättas av
# PyPI-versioner — pip kan inte avinstallera dpkg-installerade paket, och
# typing_extensions krockade direkt. Venv:en skapas utan pip, så uppströms
# pips vendrade SBOM aldrig kommer in i imagen; installationen drivs av
# Debians pip utifrån.
RUN python3 -m venv --without-pip /opt/venv \
    && pip --python /opt/venv/bin/python install --no-cache-dir -r requirements.txt
ENV PATH="/opt/venv/bin:$PATH"

# Installera både systemberoenden och Chromium vid image-build. Containern ska
# kunna starta utan nätverksberoende eller en dyr browser-download vid cold start.
RUN playwright install-deps chromium \
    && playwright install chromium

# Supervisord startar de fyra processerna från olika kataloger (/app/scraper,
# /app/api, /app/alerts, /app). Utan detta blir sys.path[0] processens egen
# katalog, och delade moduler som github_report.py måste finnas i en kopia
# bredvid varje entrypoint. Med /app på PYTHONPATH räcker en kopia i roten.
ENV PYTHONPATH=/app

COPY . .

RUN chmod +x entrypoint.sh

RUN groupadd -r appuser && useradd -r -g appuser -s /bin/sh appuser

RUN mkdir -p /ms-playwright /logs /tmp /credentials && \
    chown -R appuser:appuser /app /ms-playwright /logs /tmp /credentials

USER appuser

EXPOSE 3000 8765

ENTRYPOINT ["./entrypoint.sh"]

