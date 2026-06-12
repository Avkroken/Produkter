#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WebUI Control Plane - Proxyrar anrop till API och Scraper Engine
"""

import hmac
import os
import logging
import re
import requests
import secrets as _secrets
from datetime import datetime, timezone
from flask import Flask, render_template, request, jsonify, g, Response
from flask_cors import CORS

SCRAPER_API = os.getenv('SCRAPER_API', 'http://localhost:8000')
SCRAPER_ENGINE = os.getenv('SCRAPER_ENGINE', 'http://localhost:5001')
PATH_RE = re.compile(r"^/[A-Za-z0-9._~!$&'()*+,;=:@/%-]*$")

app = Flask(__name__)
_cors_origins = [o.strip() for o in os.getenv('WEBUI_CORS_ORIGINS', '').split(',') if o.strip()]
if _cors_origins:
    CORS(app, origins=_cors_origins)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def read_secret(env_var, default=""):
    path = os.getenv(f"{env_var}_FILE")
    if path and os.path.exists(path):
        with open(path) as f:
            return f.read().strip()
    return os.getenv(env_var, default)

def _read_credential(name):
    path = os.path.join(os.getenv("CREDENTIALS_DIR", "/credentials"), name)
    if os.path.exists(path):
        with open(path) as f:
            return f.read().strip()
    return ""

API_KEY = None
def get_api_key():
    global API_KEY
    if API_KEY is None:
        API_KEY = read_secret("API_KEY") or _read_credential("api_key")
    return API_KEY

_ENGINE_KEY = None
def _get_engine_key():
    global _ENGINE_KEY
    if _ENGINE_KEY is None:
        _ENGINE_KEY = _read_credential('engine_key') or read_secret('ENGINE_KEY')
    return _ENGINE_KEY

WEBUI_USERNAME = os.getenv('WEBUI_USERNAME', 'admin')
_WEBUI_PASSWORD = None
def _get_webui_password():
    global _WEBUI_PASSWORD
    if _WEBUI_PASSWORD is None:
        _WEBUI_PASSWORD = read_secret('WEBUI_PASSWORD') or _read_credential('webui_password')
    return _WEBUI_PASSWORD

def _validate_path(path):
    if not isinstance(path, str) or not PATH_RE.fullmatch(path):
        raise ValueError("Invalid request path")

def engine_request(method, path, **kwargs):
    _validate_path(path)
    url = f"{SCRAPER_ENGINE}{path}"
    headers = kwargs.pop('headers', {})
    key = _get_engine_key()
    if key:
        headers['X-Engine-Key'] = key
    timeout = kwargs.pop('timeout', 30)
    return requests.request(method, url, headers=headers, timeout=timeout, **kwargs)

@app.before_request
def before_each_request():
    g.csp_nonce = _secrets.token_hex(16)
    if request.path == '/health':
        return None
    pw = _get_webui_password()
    if not pw:
        return None
    auth = request.authorization
    if not auth or auth.username != WEBUI_USERNAME or not hmac.compare_digest(auth.password or '', pw):
        return Response(
            'Authentication required',
            401,
            {'WWW-Authenticate': 'Basic realm="Web Scraper"', 'Cache-Control': 'no-store'}
        )

@app.context_processor
def inject_csp_nonce():
    return {'csp_nonce': g.get('csp_nonce', '')}

def api_request(method, path, **kwargs):
    _validate_path(path)
    url = f"{SCRAPER_API}{path}"
    headers = kwargs.pop('headers', {})
    headers['X-API-Key'] = get_api_key()
    timeout = kwargs.pop('timeout', 30)
    return requests.request(method, url, headers=headers, timeout=timeout, **kwargs)

@app.after_request
def set_security_headers(response):
    nonce = g.get('csp_nonce', '')
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    if response.content_type and 'text/html' in response.content_type:
        response.headers['Content-Security-Policy'] = (
            "default-src 'self'; "
            f"script-src 'self' 'nonce-{nonce}' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "font-src https://cdn.jsdelivr.net; "
            "img-src 'self' data:; "
            "connect-src 'self'"
        )
    return response


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/config')
def config_page():
    return render_template('config.html')

@app.route('/health')
def health():
    return jsonify({'status': 'healthy', 'timestamp': datetime.now(timezone.utc).isoformat()})

@app.route('/api/configs', methods=['GET'])
def get_configs():
    try:
        resp = engine_request('GET', '/config')
        return jsonify(resp.json()), resp.status_code
    except (requests.exceptions.RequestException, ValueError) as e:
        logger.error(f"Engine error: {e}")
        return jsonify([]), 200

@app.route('/api/configs', methods=['POST'])
def create_config():
    try:
        resp = engine_request('POST', '/config', json=request.json)
        return jsonify(resp.json()), resp.status_code
    except (requests.exceptions.RequestException, ValueError) as e:
        logger.error(f"Create config error: {e}")
        return jsonify({'error': 'Internal server error'}), 503

@app.route('/api/configs/<int:config_id>', methods=['DELETE'])
def delete_config(config_id):
    try:
        resp = engine_request('DELETE', f'/config/{config_id}')
        return jsonify(resp.json()), resp.status_code
    except (requests.exceptions.RequestException, ValueError) as e:
        logger.error(f"Delete config error: {e}")
        return jsonify({'error': 'Internal server error'}), 503

@app.route('/api/scrape', methods=['POST'])
def trigger_scrape():
    try:
        resp = engine_request('POST', '/scrape')
        return jsonify(resp.json()), resp.status_code
    except (requests.exceptions.RequestException, ValueError) as e:
        logger.error(f"Trigger scrape error: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 503

@app.route('/api/test', methods=['POST'])
def test_scrape():
    try:
        resp = engine_request('POST', '/test', json=request.json)
        return jsonify(resp.json()), resp.status_code
    except (requests.exceptions.RequestException, ValueError) as e:
        logger.error(f"Test scrape error: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 503

@app.route('/api/stats')
def get_stats():
    try:
        resp = api_request('GET', '/stats')
        return jsonify(resp.json()), resp.status_code
    except (requests.exceptions.RequestException, ValueError) as e:
        return jsonify({'total_products': 0, 'updated_24h': 0, 'active_configs': 0})

@app.route('/api/products')
def get_products():
    try:
        resp = api_request('GET', '/products', params=request.args)
        return jsonify(resp.json()), resp.status_code
    except (requests.exceptions.RequestException, ValueError) as e:
        return jsonify({'products': [], 'total': 0})

@app.route('/api/products/<int:product_id>/history')
def get_product_history(product_id):
    try:
        resp = api_request('GET', f'/products/{product_id}/history')
        return jsonify(resp.json()), resp.status_code
    except (requests.exceptions.RequestException, ValueError) as e:
        return jsonify({'history': []}), 200

@app.route('/api/deals')
def get_deals():
    try:
        resp = api_request('GET', '/deals', params=request.args)
        return jsonify(resp.json()), resp.status_code
    except (requests.exceptions.RequestException, ValueError) as e:
        return jsonify({'deals': []}), 200

@app.route('/api/detect', methods=['POST'])
def detect_selectors():
    try:
        resp = engine_request('POST', '/detect', json=request.json, timeout=110)
        return jsonify(resp.json()), resp.status_code
    except (requests.exceptions.RequestException, ValueError) as e:
        logger.error(f"Detect error: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 503

@app.route('/api/export/csv')
def export_csv():
    try:
        from flask import Response
        resp = engine_request('GET', '/export')
        return Response(
            resp.content,
            status=resp.status_code,
            mimetype='text/csv',
            headers={'Content-Disposition': resp.headers.get('Content-Disposition', 'attachment; filename=products.csv')}
        )
    except (requests.exceptions.RequestException, ValueError) as e:
        logger.error(f"Export error: {e}")
        return jsonify({'error': 'Export failed'}), 503

@app.route('/api/settings', methods=['GET'])
def get_settings():
    try:
        resp = engine_request('GET', '/settings')
        return jsonify(resp.json()), resp.status_code
    except (requests.exceptions.RequestException, ValueError) as e:
        logger.error(f"Settings error: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 503


@app.route('/api/settings/<key>', methods=['PUT'])
def update_setting(key):
    try:
        resp = engine_request('PUT', f'/settings/{key}', json=request.json)
        return jsonify(resp.json()), resp.status_code
    except (requests.exceptions.RequestException, ValueError) as e:
        logger.error(f"Settings update error: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 503


_ALLOWED_CREDENTIAL_PATHS = frozenset(['password', 'username'])

@app.route('/api/credentials/<path:subpath>', methods=['PUT'])
def update_credential(subpath):
    if subpath not in _ALLOWED_CREDENTIAL_PATHS:
        return jsonify({'status': 'error', 'message': 'Not found'}), 404
    try:
        resp = engine_request('PUT', f'/credentials/{subpath}', json=request.json)
        return jsonify(resp.json()), resp.status_code
    except (requests.exceptions.RequestException, ValueError) as e:
        logger.error(f"Credentials update error: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 503


