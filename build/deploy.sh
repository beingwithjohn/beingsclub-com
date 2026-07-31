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
# only the site — never sweep in a neighbouring project's build artefacts
git add index.html about salons sits beyondbelief join 404.html assets build docs .gitignore 2>/dev/null || true
if git diff --cached --quiet; then echo "nothing to commit"; else
  git commit -q -m "$MSG

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
fi
git push -q origin main
HEAD_SHA="$(git rev-parse HEAD)"
echo "    pushed ${HEAD_SHA:0:7}"

echo "==> waiting for Pages to build THIS commit"
for i in $(seq 1 40); do
  read -r STATUS SHA <<<"$(gh api "repos/$REPO/pages/builds/latest" --jq '.status + " " + .commit' 2>/dev/null || echo "unknown -")"
  if [ "$STATUS" = "built" ] && [ "$SHA" = "$HEAD_SHA" ]; then echo "    built ${SHA:0:7}"; break; fi
  if [ "$i" = "40" ]; then echo "    TIMED OUT — live is $STATUS ${SHA:0:7}, expected ${HEAD_SHA:0:7}"; exit 1; fi
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
