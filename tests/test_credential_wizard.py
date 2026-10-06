from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / "scripts" / "setup-provider-credentials.sh"
WIZARD = ROOT / "scripts" / "setup-provider-credentials.wizard.sh"


def test_credential_wizard_bash_syntax():
    for path in (LAUNCHER, WIZARD):
        result = subprocess.run(["bash", "-n", str(path)], capture_output=True, text=True)
        assert result.returncode == 0, result.stderr


def test_credential_wizard_is_verification_only():
    launcher = LAUNCHER.read_text()
    wizard = WIZARD.read_text()
    marker = "# STAGES: author this section."
    assert marker in wizard
    stages = wizard[wizard.index(marker):]
    assert "tput()" in launcher
    assert "export -f tput" in launcher
    assert not re.search(r"^\s*(ask|ask_secret|write_env|set_secret|set_var)\s+", stages, re.M)
    assert not re.search(r"\bwrangler\s+(secret|deploy)\b", stages)
    assert not re.search(r"\bgh\s+(secret|variable)\s+set\b", stages)


def test_credential_wizard_covers_produkter_boundaries():
    stages = WIZARD.read_text()
    for value in (
        "PROVIDER_CONFIG_MASTER_KEY",
        "FLASK_SECRET_KEY",
        "INGEST_API_KEY_STORE",
        "INGEST_API_KEY",
        "CLOUDFLARE_DEPLOYMENT_CONFIG",
        "Workers Builds: produkter",
        "Workers Builds: produkter-motor",
        "Workers Builds: produkter-bearbetare",
    ):
        assert value in stages
    assert "GET /health är uttryckligen inte credentialbevis" in stages
