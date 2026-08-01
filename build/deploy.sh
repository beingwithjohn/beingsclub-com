#!/usr/bin/env bash
# Deploy beingsclub.com. Use this rather than a bare git push.
#
#   build/deploy.sh "commit message"
#
# It refuses to ship a build that does not parse, refuses to ship from a branch
# GitHub Pages does not serve, and does not report success until the commit that
# is LIVE is the commit you just pushed. Each of those has failed once.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="beingwithjohn/beingsclub-com"
MSG="${1:-}"

if [ -z "$MSG" ]; then echo "usage: build/deploy.sh \"commit message\""; exit 2; fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  echo "REFUSING: you are on '$BRANCH'. Pages serves 'main', so a push here"
  echo "would look successful and change nothing on the site."
  echo "  git checkout main   # then re-run"
  exit 1
fi

echo "==> regenerating"
python3 build/build_shell.py >/dev/null

echo "==> verifying the build"
python3 build/verify.py

echo "==> committing"
git add -A
# an allowlist of paths goes stale and silently drops changes; instead take
# everything and refuse anything that looks like a build artefact. node_modules
# once slipped in this way — 133MB, including an 82MB binary.
BIG="$(git diff --cached --name-only | while read -r f; do
        if [ -f "$f" ] && [ "$(wc -c <"$f")" -gt 5000000 ]; then echo "$f"; fi
      done)"
JUNK="$(git diff --cached --name-only | grep -E '(^|/)(node_modules|\.wrangler|dist)/' || true)"
if [ -n "$BIG$JUNK" ]; then
  echo "REFUSING: these do not belong in the site repo —"
  [ -n "$BIG" ]  && echo "$BIG"  | sed 's/^/  over 5MB: /'
  [ -n "$JUNK" ] && echo "$JUNK" | sed 's/^/  build artefact: /'
  echo "  add them to .gitignore, then re-run"
  git reset -q
  exit 1
fi
if git diff --cached --quiet; then echo "nothing to commit"; else
  git commit -q -m "$MSG

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
fi
git push -q origin main
HEAD_SHA="$(git rev-parse HEAD)"
echo "    pushed ${HEAD_SHA:0:7}"

echo "==> waiting for the site to serve THIS build"
# Not via the Pages API: repos/:r/pages/builds is legacy and has reported a stale
# commit for a deploy that was already live. Compare the served bytes instead.
WANT="$(shasum index.html | cut -d' ' -f1)"
for i in $(seq 1 40); do
  GOT="$(curl -fsS "https://$(cat CNAME)/" 2>/dev/null | shasum | cut -d' ' -f1 || true)"
  if [ "$GOT" = "$WANT" ]; then echo "    live matches ${HEAD_SHA:0:7}"; break; fi
  if [ "$i" = "40" ]; then echo "    TIMED OUT — the site is still serving something else"; exit 1; fi
  sleep 6
done

echo "==> verifying what is actually being served"
for i in $(seq 1 12); do
  if python3 build/verify.py --live >/tmp/bc-live.log 2>&1; then
    tail -1 /tmp/bc-live.log; echo "DEPLOYED ✓ https://beingsclub.com"; exit 0
  fi
  sleep 8
done
echo "LIVE CHECKS FAILED — the site may be serving a broken build:"
cat /tmp/bc-live.log
exit 1
