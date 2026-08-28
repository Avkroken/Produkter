#!/bin/sh
# Entrypoint for the scraper image.
# Chromium is installed at image-build time so startup does not depend on a
# browser download or external package service.

chmod 700 /credentials 2>/dev/null || true
chmod 600 /credentials/* 2>/dev/null || true

exec supervisord -c /app/supervisord.conf
