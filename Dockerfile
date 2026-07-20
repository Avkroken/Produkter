FROM python:3.14-slim@sha256:cea0e6040540fb2b965b6e7fb5ffa00871e632eef63719f0ea54bca189ce14a6

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update && apt-get install -y --no-install-recommends \
    supervisor \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
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

