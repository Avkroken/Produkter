import os

import github_report
from github_report import _redact, report_error_to_github


class TestRedact:
    def test_redacts_secret_like_env_var_value(self, monkeypatch):
        monkeypatch.setenv("MY_API_KEY", "supersecretvalue123")
        assert "supersecretvalue123" not in _redact("error with supersecretvalue123 in it")
        assert "[REDACTED]" in _redact("error with supersecretvalue123 in it")

    def test_does_not_redact_short_values(self, monkeypatch):
        monkeypatch.setenv("SOME_KEY", "abc")
        text = _redact("contains abc here")
        assert "abc here" in text

    def test_redacts_email(self):
        assert "[EMAIL REDACTED]" in _redact("failed for person@example.com")
        assert "person@example.com" not in _redact("failed for person@example.com")

    def test_redacts_home_path(self):
        assert "/home/[user]/" in _redact("File \"/home/exampleuser/GitHub/app.py\", line 1")
        assert "exampleuser" not in _redact("File \"/home/exampleuser/GitHub/app.py\", line 1")

    def test_redacts_known_key_patterns(self):
        assert "[REDACTED]" in _redact("token=ghp_abcdefghijklmnopqrstuvwxyz0123")
        assert "ghp_" not in _redact("token=ghp_abcdefghijklmnopqrstuvwxyz0123")


class TestErrorReportingConfiguration:
    def test_warns_when_token_exists_without_repository(self, monkeypatch):
        monkeypatch.setenv("GITHUB_ERROR_REPORT_TOKEN", "fake-token")
        monkeypatch.delenv("GITHUB_ERROR_REPORT_REPOSITORY", raising=False)
        monkeypatch.setattr(github_report, "PRODUKTER_REPOSITORY_ID", "")
        assert "GITHUB_ERROR_REPORT_REPOSITORY" in github_report._error_reporting_configuration_warning()

    def test_no_warning_when_repository_is_configured(self, monkeypatch):
        monkeypatch.setenv("GITHUB_ERROR_REPORT_TOKEN", "fake-token")
        monkeypatch.setattr(github_report, "PRODUKTER_REPOSITORY_ID", "owner/repository")
        assert github_report._error_reporting_configuration_warning() is None


class TestReportErrorToGithub:
    def test_resolves_stable_repository_id(self, monkeypatch):
        class Response:
            status_code = 200

            @staticmethod
            def json():
                return {"full_name": "renamed/Produkter"}

        monkeypatch.setattr(github_report.requests, "get", lambda *args, **kwargs: Response())
        assert (
            github_report._resolve_repo(123456789, {})
            == "renamed/Produkter"
        )

    def test_returns_none_without_token(self, monkeypatch):
        monkeypatch.delenv("GITHUB_ERROR_REPORT_TOKEN", raising=False)
        result = report_error_to_github("owner/test", "title", ValueError("x"))
        assert result is None

    def test_never_raises_on_network_failure(self, monkeypatch):
        monkeypatch.setenv("GITHUB_ERROR_REPORT_TOKEN", "fake-token")
        monkeypatch.setattr(github_report, "_report_times", [])

        def boom(*args, **kwargs):
            raise github_report.requests.RequestException("network down")

        monkeypatch.setattr(github_report.requests, "get", boom)
        monkeypatch.setattr(github_report.requests, "post", boom)
        result = report_error_to_github("owner/test", "title", ValueError("x"))
        assert result is None

    def test_throttles_after_max_per_window(self, monkeypatch):
        monkeypatch.setenv("GITHUB_ERROR_REPORT_TOKEN", "fake-token")
        monkeypatch.setattr(github_report, "_report_times", [])
        monkeypatch.setattr(github_report, "_REPORT_MAX_PER_WINDOW", 2)
        calls = []
        monkeypatch.setattr(
            github_report.requests, "get",
            lambda *a, **k: calls.append(1) or (_ for _ in ()).throw(github_report.requests.RequestException()),
        )
        monkeypatch.setattr(
            github_report.requests, "post",
            lambda *a, **k: (_ for _ in ()).throw(github_report.requests.RequestException()),
        )
        # De första två släpps igenom (och försöker nätverk), den tredje stoppas av spärren.
        report_error_to_github("owner/test", "t", ValueError("x"))
        report_error_to_github("owner/test", "t", ValueError("y"))
        report_error_to_github("owner/test", "t", ValueError("z"))
        assert len(calls) == 2
