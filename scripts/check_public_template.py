#!/usr/bin/env python3
"""Fail CI if known installation-specific values re-enter the public template."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN = {
    "private domain": "denied.se",
    "personal admin address": "anders.eriksson",
    "old D1 id": "d0bf1d69-64c4-4072-b9ce-d9a15129b526",
    "old KV id": "adafd9ea9ec24bc8ab8da87ff80467cc",
    "old Google OAuth client id": "551393755081-gtbd45b203icbbp0cu0q0p4meppli2fu.apps.googleusercontent.com",
    "old repository id": "1223482099",
}

SKIP_DIRS = {".git", "node_modules", ".wrangler", "__pycache__", ".pytest_cache"}
SKIP_FILES = {Path(__file__).name}

violations = []
for path in ROOT.rglob("*"):
    if not path.is_file() or path.name in SKIP_FILES or any(part in SKIP_DIRS for part in path.parts):
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    for label, needle in FORBIDDEN.items():
        if needle.lower() in text.lower():
            violations.append(f"{path.relative_to(ROOT)}: {label}")

if violations:
    raise SystemExit("Installation-specific values found:\n" + "\n".join(sorted(violations)))

print("Public-template contamination check passed.")
