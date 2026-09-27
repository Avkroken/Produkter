#!/usr/bin/env python3
"""Fail CI if known installation-specific values re-enter the public template."""

from hashlib import sha256
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

# SHA-256 fingerprints only: the old installation values are intentionally not
# retained in source, tests, comments or documentation.
FORBIDDEN_FINGERPRINTS = {
    "e616bcc305314c41224898c8c4e38d84e81e733e2c1281f02c4690376be4e72f",
    "40feb4f559c7aa93166361e60e04d6a44067f154448bb8fe520243e980c0fb27",
    "9e60e46830887d37cf41074d0dc4798a9f8776cbecf2742ee6fdcd1be4b32cdf",
    "61e34e748075a3525d1fcbc2b346044aef4b412f3893af8dc563ac97845c19c1",
    "2d9837d23e4d5ffa2066fa07d6c4a3f9a913c32c09af74ecf631f99672f31e98",
    "64aba032e41c85b143c2c7657832cb9d60f4cbb5150da065b2e4f7912f520c44",
    "47d0a89719d861bcb2b09bd322e8380c9c7bd949c61dd4831e6e61f238c3dc46",
}

SKIP_DIRS = {".git", "node_modules", ".wrangler", "__pycache__", ".pytest_cache"}
TOKEN_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._@:-]{2,}")


def digest(value: str) -> str:
    return sha256(value.lower().encode()).hexdigest()


def candidates(token: str) -> set[str]:
    token = token.lower().strip("._:@-")
    values = {token} if token else set()

    if "@" in token:
        local, _, domain = token.partition("@")
        if local:
            values.add(local)
        if domain:
            values.add(domain)

    # Include domain suffixes so a forbidden base domain is detected when it
    # occurs as a subdomain, without storing that base domain in this file.
    domainish = token.rsplit("@", 1)[-1]
    parts = [part for part in domainish.split(".") if part]
    for index in range(max(0, len(parts) - 4), len(parts)):
        suffix = ".".join(parts[index:])
        if suffix:
            values.add(suffix)

    return values


violations = []
for path in ROOT.rglob("*"):
    if not path.is_file() or any(part in SKIP_DIRS for part in path.parts):
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue

    for token in TOKEN_RE.findall(text):
        if any(digest(candidate) in FORBIDDEN_FINGERPRINTS for candidate in candidates(token)):
            violations.append(str(path.relative_to(ROOT)))
            break

if violations:
    raise SystemExit(
        "Installation-specific value fingerprint found in:\n"
        + "\n".join(sorted(violations))
    )

print("Public-template contamination check passed.")
