#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Alert service with cooldown in PostgreSQL
"""

import asyncio
import os
import logging
import sys
import signal
import requests
import psycopg2
import psycopg2.extras
from psycopg2.pool import ThreadedConnectionPool

from github_report import report_error_to_github

# === Configuration ===
LOG_DIR = "/logs"
DB_HOST = os.getenv('DB_HOST', 'postgres')
DB_NAME = os.getenv('DB_NAME', 'scraper')
DB_USER = os.getenv('DB_USER', 'scraper')

DEFAULTS = {
    'check_interval': 1800,
    'min_drop_percent': 5.0,
    'min_drop_amount': 100,
    'cooldown_hours': 24,
}

os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(f"{LOG_DIR}/alerts.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

shutdown_event = asyncio.Event()
alerts_sent = 0
db_pool = None


def read_secret(env_var, default=""):
    path = os.getenv(f"{env_var}_FILE")
    if path and os.path.exists(path):
        with open(path) as f:
            return f.read().strip()
    return os.getenv(env_var, default)


def init_db_pool():
    global db_pool
    db_password = read_secret("DB_PASSWORD")
    db_pool = ThreadedConnectionPool(
        minconn=1, maxconn=5,
        host=DB_HOST, database=DB_NAME, user=DB_USER,
        password=db_password, connect_timeout=10
    )


def get_db():
    return db_pool.getconn()


def return_db(conn):
    db_pool.putconn(conn)


def get_setting(key):
    default = DEFAULTS.get(key)
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT value FROM settings WHERE key = %s", (key,))
        row = cur.fetchone()
        raw = row[0] if row else None
    except psycopg2.errors.UndefinedTable:
        conn.rollback()
        return default
    except psycopg2.Error:
        conn.rollback()
        return default
    finally:
        return_db(conn)
    if raw is None:
        return default
    if isinstance(default, float):
        return float(raw)
    if isinstance(default, int):
        return int(raw)
    return raw


def get_webhook():
    return read_secret("DISCORD_WEBHOOK")


def send_discord(webhook, title, old_price, new_price, url):
    drop = old_price - new_price
    percent = round((drop / old_price) * 100, 1)
    payload = {
        "embeds": [{
            "title": "💸 Price Drop!",
            "description": f"**{title}**",
            "color": 16711680,
            "fields": [
                {"name": "Old", "value": f"{old_price:,} kr".replace(",", " "), "inline": True},
                {"name": "New", "value": f"{new_price:,} kr".replace(",", " "), "inline": True},
                {"name": "Drop", "value": f"-{drop:,} kr ({percent}%)".replace(",", " "), "inline": True},
                {"name": "Link", "value": url}
            ]
        }]
    }
    try:
        return requests.post(webhook, json=payload, timeout=10).status_code == 204
    except requests.exceptions.RequestException:
        return False


async def check_drops():
    global alerts_sent

    min_drop_percent = get_setting('min_drop_percent')
    min_drop_amount = get_setting('min_drop_amount')
    cooldown_hours = get_setting('cooldown_hours')

    webhook = get_webhook()
    if not webhook:
        logger.error("No webhook configured")
        return 0

    conn = get_db()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        cur.execute("""
            WITH price_drops AS (
                SELECT
                    p.id,
                    p.title,
                    p.url,
                    ph.price AS new_price,
                    LAG(ph.price) OVER (PARTITION BY p.id ORDER BY ph.timestamp) AS old_price
                FROM products p
                JOIN price_history ph ON p.id = ph.product_id
            )
            SELECT * FROM price_drops
            WHERE old_price IS NOT NULL AND new_price < old_price
        """)

        alerts_this_run = 0

        for row in cur.fetchall():
            drop_amount = row['old_price'] - row['new_price']
            drop_percent = (drop_amount / row['old_price']) * 100

            if drop_percent < min_drop_percent or drop_amount < min_drop_amount:
                continue

            cur.execute("""
                INSERT INTO alert_cooldown (product_id, last_alert)
                VALUES (%s, NOW())
                ON CONFLICT (product_id) DO UPDATE SET
                    last_alert = NOW()
                WHERE alert_cooldown.last_alert < NOW() - (%s * INTERVAL '1 hour')
                RETURNING product_id
            """, (row['id'], cooldown_hours))

            if cur.fetchone():
                if send_discord(webhook, row['title'], row['old_price'], row['new_price'], row['url']):
                    alerts_this_run += 1
                    alerts_sent += 1
                    logger.info(f"Alert sent: {row['title'][:50]}...")
                    await asyncio.sleep(1)

        conn.commit()
        return alerts_this_run
    finally:
        return_db(conn)


async def alerts_loop():
    while not shutdown_event.is_set():
        try:
            sent = await check_drops()
            if sent:
                logger.info(f"Sent {sent} alerts")
        except (psycopg2.Error, requests.exceptions.RequestException, OSError) as e:
            logger.error(f"Error: {e}")
            report_error_to_github("blixten85/product-describer", "Alerts check failed", e)

        check_interval = get_setting('check_interval')
        logger.info(f"Next check in {check_interval}s")
        try:
            await asyncio.wait_for(shutdown_event.wait(), timeout=check_interval)
        except asyncio.TimeoutError:
            continue

    logger.info(f"Alerts stopped. Total sent: {alerts_sent}")


def signal_handler():
    shutdown_event.set()


async def main():
    init_db_pool()
    loop = asyncio.get_event_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, signal_handler)
    await alerts_loop()
    if db_pool:
        db_pool.closeall()


if __name__ == "__main__":
    asyncio.run(main())
