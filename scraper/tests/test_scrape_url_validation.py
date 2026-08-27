import asyncio
import socket

import pytest

from scraper.scraper.scraper import _install_ssrf_guard, _validate_scrape_url


def _address(family, address):
    return (family, socket.SOCK_STREAM, 6, "", (address, 443))


def test_accepts_hostname_only_when_all_resolved_addresses_are_public(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: [
            _address(socket.AF_INET, "93.184.216.34"),
            _address(socket.AF_INET6, "2606:2800:220:1:248:1893:25c8:1946"),
        ],
    )

    _validate_scrape_url("https://example.com/products")


@pytest.mark.parametrize(
    "address",
    ["127.0.0.1", "169.254.169.254", "10.0.0.4", "::1", "fd00::1"],
)
def test_rejects_non_public_literal_addresses(address):
    with pytest.raises(ValueError, match="private/internal"):
        _validate_scrape_url(f"http://[{address}]/" if ":" in address else f"http://{address}/")


def test_rejects_hostname_if_any_resolved_address_is_non_public(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *args, **kwargs: [
            _address(socket.AF_INET, "93.184.216.34"),
            _address(socket.AF_INET, "127.0.0.1"),
        ],
    )

    with pytest.raises(ValueError, match="private/internal"):
        _validate_scrape_url("https://example.com/")


def test_rejects_unresolvable_hostname(monkeypatch):
    def fail_resolution(*args, **kwargs):
        raise socket.gaierror("not found")

    monkeypatch.setattr(socket, "getaddrinfo", fail_resolution)

    with pytest.raises(ValueError, match="cannot be resolved"):
        _validate_scrape_url("https://missing.example/")


def test_rejects_url_credentials():
    with pytest.raises(ValueError, match="credentials"):
        _validate_scrape_url("https://public.example@127.0.0.1/")


def test_browser_guard_blocks_private_redirect_target():
    class Page:
        async def route(self, pattern, handler):
            self.pattern = pattern
            self.handler = handler

    class Route:
        def __init__(self):
            self.aborted = False
            self.continued = False

        async def abort(self, reason):
            self.aborted = reason == "blockedbyclient"

        async def continue_(self):
            self.continued = True

    page = Page()
    route = Route()
    asyncio.run(_install_ssrf_guard(page))
    asyncio.run(page.handler(route, type("Request", (), {"url": "http://127.0.0.1/admin"})()))

    assert page.pattern == "**/*"
    assert route.aborted is True
    assert route.continued is False
