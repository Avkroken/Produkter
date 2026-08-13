FROM debian:trixie-slim@sha256:3a39a0592364683e6bab97937b72cad5a8fa6dcbbee90edb3bb48c7f8e94f258

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
RUN pip install --break-system-packages --no-cache-dir -r requirements.txt

COPY . .

RUN useradd -m appuser \
    && mkdir -p uploads outputs config \
    && chown appuser:appuser uploads outputs config

USER appuser

EXPOSE 5050

CMD ["gunicorn", "--bind", "0.0.0.0:5050", "--workers", "1", "--threads", "8", "app:app"]
