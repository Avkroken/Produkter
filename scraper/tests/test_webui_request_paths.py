import pytest

from scraper.webui.app import API_PATH_RE, ENGINE_PATH_RE, _validate_path


@pytest.mark.parametrize(
    ("path", "allowed_paths"),
    [
        ("/config", ENGINE_PATH_RE),
        ("/config/42", ENGINE_PATH_RE),
        ("/settings/cooldown_hours", ENGINE_PATH_RE),
        ("/credentials/password", ENGINE_PATH_RE),
        ("/products/42/history", API_PATH_RE),
        ("/deals", API_PATH_RE),
    ],
)
def test_allows_only_declared_internal_service_paths(path, allowed_paths):
    _validate_path(path, allowed_paths)


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
        _validate_path(path, ENGINE_PATH_RE)
