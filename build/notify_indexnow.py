#!/usr/bin/env python3
"""Notify IndexNow after a verified deployment, without tracking visitors.

Only URLs whose public source changed in the deployed commit are submitted.
The site is deliberately small, so an asset or sitemap change refreshes the
complete public set rather than trying to guess which pages use that asset.
Failures are warnings: search notification must never turn a healthy deploy
into a failed deploy.
"""
import io
import json
import os
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIGIN = "https://beingsclub.com"
HOST = "beingsclub.com"
KEY = "7791d2e130943508e1eea9169ea2b217"
KEY_FILE = KEY + ".txt"
ENDPOINT = "https://api.indexnow.org/indexnow"

PUBLIC_PATHS = {
    "index.html": "/",
    "about/index.html": "/about/",
    "salons/index.html": "/salons/",
    "sits/index.html": "/sits/",
    "beyondbelief/index.html": "/beyondbelief/",
    "beyondbelief/companion/index.html": "/beyondbelief/companion/",
    "join/index.html": "/join/",
    "practice-map/index.html": "/practice-map/",
    "giving/index.html": "/giving/",
}


def all_urls():
    return sorted(ORIGIN + route for route in PUBLIC_PATHS.values())


def changed_paths(old, new):
    result = subprocess.run(
        ["git", "diff", "--name-only", old, new],
        cwd=ROOT, capture_output=True, text=True, check=True,
    )
    return [line.strip() for line in result.stdout.splitlines() if line.strip()]


def urls_for(paths):
    paths = set(paths)
    # A new verification key, changed sitemap, or changed public artwork can
    # affect every discoverable page.
    if KEY_FILE in paths or "sitemap.xml" in paths or any(
        path.startswith("assets/") for path in paths
    ):
        return all_urls()
    return sorted(ORIGIN + PUBLIC_PATHS[path] for path in paths if path in PUBLIC_PATHS)


def main():
    dry_run = "--dry-run" in sys.argv
    args = [arg for arg in sys.argv[1:] if arg != "--dry-run"]
    old, new = (args + ["HEAD^", "HEAD"])[:2]
    try:
        urls = urls_for(changed_paths(old, new))
    except Exception as exc:
        print("    IndexNow warning: could not inspect deployed changes: %s" % exc)
        return 0

    if not urls:
        print("    IndexNow: no public page changes to submit")
        return 0

    payload = {
        "host": HOST,
        "key": KEY,
        "keyLocation": ORIGIN + "/" + KEY_FILE,
        "urlList": urls,
    }
    if dry_run:
        print(json.dumps(payload, indent=2))
        return 0

    try:
        request = urllib.request.Request(
            ENDPOINT,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json; charset=utf-8",
                     "User-Agent": "BeingsClub-Deploy/1.0"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            print("    IndexNow accepted %d URL%s (HTTP %d)" %
                  (len(urls), "" if len(urls) == 1 else "s", response.status))
    except Exception as exc:
        print("    IndexNow warning: notification was not accepted: %s" % exc)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
