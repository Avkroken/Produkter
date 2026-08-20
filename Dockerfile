# Flytande: `stable-slim` följer Debians nuvarande stable, `trixie-slim` gör
# det inte — den sitter kvar på trixie även när nästa stable släppts. En
# pinnad digest ovanpå det hade dessutom frusit även säkerhetsuppdateringarna
# tills Dependabot råkade bumpa den.
FROM debian:stable-slim

# Python och pip kommer från Debian i stället för från python-imagen. Skälet är
# underhållskedjan: Debians säkerhetsteam patchar dem, och apt-get full-upgrade
# nedan plockar upp rättningarna vid varje bygge.
#
# Basen byts samtidigt från alpine till debian. Alpine krävde gcc, musl-dev och
# libffi-dev för att bygga hjul som saknas för musl — på Debian finns de
# prebyggda, så hela byggberoende-dansen försvinner.
RUN apt-get update && apt-get full-upgrade -y && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
# Appens beroenden i ett eget träd. Debians Python-paket får inte ersättas av
# PyPI-versioner — pip kan inte avinstallera dpkg-installerade paket, och
# typing_extensions krockade direkt. Venv:en skapas utan pip, så uppströms
# pips vendrade SBOM aldrig kommer in i imagen; installationen drivs av
# Debians pip utifrån.
RUN python3 -m venv --without-pip /opt/venv \
    && pip --python /opt/venv/bin/python install --no-cache-dir -r requirements.txt
ENV PATH="/opt/venv/bin:$PATH"

# Kopiera bara runtime-koden. Det gör Docker-contextens beroenden explicita och
# förhindrar att Cloudflare-, scraper-, test- eller dokumentationsändringar
# råkar invalidiera eller förändra huvudimagen.
COPY app.py auth.py csv_safety.py extractors.py github_report.py main.py prompts.py provider_config.py providers.py ./
COPY templates ./templates

RUN useradd -m appuser \
    && mkdir -p uploads outputs config \
    && chown appuser:appuser uploads outputs config

USER appuser

EXPOSE 5050

CMD ["gunicorn", "--bind", "0.0.0.0:5050", "--workers", "1", "--threads", "8", "app:app"]
