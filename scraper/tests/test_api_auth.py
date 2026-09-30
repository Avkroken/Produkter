"""Exercise authentication before protected routes, without a database or network."""
import asyncio
import importlib.util
from pathlib import Path

from fastapi import Request
from fastapi.responses import JSONResponse
import pytest


@pytest.fixture
def api(monkeypatch):
    root = Path(__file__).resolve().parents[1]
    monkeypatch.syspath_prepend(str(root))
    spec = importlib.util.spec_from_file_location("scraper_api_auth_test", root / "api/api.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def request_with_key(value):
    headers = [] if value is None else [(b"x-api-key", value.encode())]
    return Request({"type": "http", "method": "GET", "path": "/products", "headers": headers})


@pytest.mark.parametrize("provided", [None, "", "anything"])
def test_unconfigured_server_denies_all_protected_requests(api, provided):
    api.API_KEY = ""
    async def protected(request):
        pytest.fail("Unconfigured authentication reached a protected route")
    response = asyncio.run(api.check_api_key(request_with_key(provided), protected))
    assert response.status_code == 503


@pytest.mark.parametrize("provided", [None, "", "wrong"])
def test_invalid_key_returns_401_response(api, provided):
    api.API_KEY = "synthetic-key"
    async def protected(request):
        pytest.fail("Invalid key reached a protected route")
    response = asyncio.run(api.check_api_key(request_with_key(provided), protected))
    assert response.status_code == 401


def test_valid_key_reaches_protected_route(api):
    api.API_KEY = "synthetic-key"
    async def protected(request):
        return JSONResponse({"ok": True})
    response = asyncio.run(api.check_api_key(request_with_key("synthetic-key"), protected))
    assert response.status_code == 200


def test_lifespan_initializes_and_closes_database_pool(api, monkeypatch):
    class Pool:
        closed = False

        def closeall(self):
            self.closed = True

    pool = Pool()

    def initialize():
        api.db_pool = pool

    monkeypatch.setattr(api, "init_db_pool", initialize)

    async def exercise():
        async with api.lifespan(api.app):
            assert api.db_pool is pool
        assert api.db_pool is None

    asyncio.run(exercise())
    assert pool.closed is True
