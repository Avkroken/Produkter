import ast
from pathlib import Path

import pytest

SOURCE = Path(__file__).resolve().parents[1] / "scraper" / "scraper.py"


def _load_safe_log_value():
    tree = ast.parse(SOURCE.read_text(), filename=str(SOURCE))
    helper = next(
        node for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "_safe_log_value"
    )
    module = ast.Module(body=[helper], type_ignores=[])
    namespace = {}
    exec(compile(ast.fix_missing_locations(module), str(SOURCE), "exec"), namespace)
    return namespace["_safe_log_value"]


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("GET\nforged", "GET\\nforged"),
        ("/ok\r\nforged", "/ok\\r\\nforged"),
        ("plain", "plain"),
    ],
)
def test_safe_log_value_escapes_line_breaks(value, expected):
    sanitized = _load_safe_log_value()(value)
    assert sanitized == expected
    assert "\r" not in sanitized
    assert "\n" not in sanitized


def test_unexpected_error_handler_logs_sanitized_request_values():
    source = SOURCE.read_text()
    assert "method = _safe_log_value(request.method)" in source
    assert "path = _safe_log_value(request.path)" in source
    assert 'logger.exception("Unhandled error handling %s %s", method, path)' in source
