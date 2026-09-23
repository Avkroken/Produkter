FROM debian:stable-slim

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PATH="/opt/venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get full-upgrade -y \
    && apt-get install -y --no-install-recommends python3 python3-pip python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt

RUN python3 -m venv --without-pip /opt/venv \
    && pip --python /opt/venv/bin/python install --no-cache-dir -r /app/requirements.txt \
    && /opt/venv/bin/playwright install-deps chromium \
    && /opt/venv/bin/playwright install chromium

COPY fetcher.py /app/fetcher.py

RUN groupadd -r appuser \
    && useradd -r -g appuser -s /usr/sbin/nologin appuser \
    && mkdir -p /ms-playwright \
    && chown -R appuser:appuser /app /ms-playwright

USER appuser

ENTRYPOINT ["python", "/app/fetcher.py"]
