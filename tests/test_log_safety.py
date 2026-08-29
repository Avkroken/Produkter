import ast
from pathlib import Path

import pytest

ROOT_APP = Path(__file__).resolve().parents[1] / "app.py"
WEBUI_APP = Path(__file__).resolve().parents[1] / "scraper" / "webui" / "app.py"


def _load_helper(path):
    tree = ast.parse(path.read_text(), filename=str(path))
    helper = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "_safe_log_value")
    module = ast.Module(body=[helper], type_ignores=[])
    namespace = {}
    exec(compile(ast.fix_missing_locations(module), str(path), "exec"), namespace)
    return namespace["_safe_log_value"]


@pytest.mark.parametrize("path", [ROOT_APP, WEBUI_APP])
@pytest.mark.parametrize(("value", "expected"), [("GET\nforged", "GET\\nforged"), ("/ok\r\nforged", "/ok\\r\\nforged"), ("plain", "plain")])
def test_log_sanitizer_escapes_line_breaks(path, value, expected):
    sanitized = _load_helper(path)(value)
    assert sanitized == expected
    assert "\r" not in sanitized
    assert "\n" not in sanitized


def test_request_error_logs_use_sanitized_values():
    for path, logger in [(ROOT_APP, "log"), (WEBUI_APP, "logger")]:
        source = path.read_text()
        assert "method = _safe_log_value(request.method)" in source
        assert "path = _safe_log_value(request.path)" in source
        assert f'{logger}.exception("Unhandled error handling %s %s", method, path)' in source


def test_provider_error_log_does_not_include_request_selected_provider():
    source = ROOT_APP.read_text()
    assert 'log.exception("Failed to save provider configuration")' in source
    assert 'Failed to save provider configuration for provider' not in source
