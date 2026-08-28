import sys
from pathlib import Path

import pytest

SCRAPER_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRAPER_ROOT))

from webui.app import SCRAPER_API, SCRAPER_ENGINE, _api_url, _engine_url


@pytest.mark.parametrize(
    ("resolver", "path", "expected"),
    [
        (_engine_url, "/config", f"{SCRAPER_ENGINE}/config"),
        (_engine_url, "/config/42", f"{SCRAPER_ENGINE}/config/42"),
        (_engine_url, "/settings/cooldown_hours", f"{SCRAPER_ENGINE}/settings/cooldown_hours"),
        (_engine_url, "/credentials/password", f"{SCRAPER_ENGINE}/credentials/password"),
        (_api_url, "/products/42/history", f"{SCRAPER_API}/products/42/history"),
        (_api_url, "/deals", f"{SCRAPER_API}/deals"),
    ],
)
def test_resolves_only_declared_internal_service_paths(resolver, path, expected):
    assert resolver(path) == expected


@pytest.mark.parametrize(
    "path",
    [
        "/../admin",
        "/config/../../admin",
        "//169.254.169.254/latest/meta-data",
        "/config?target=http://127.0.0.1",
        "/credentials/username/../../admin",
        "/%2e%2e/admin",
    ],
)
def test_rejects_paths_outside_internal_service_allowlist(path):
    with pytest.raises(ValueError, match="Invalid request path"):
        _engine_url(path)
