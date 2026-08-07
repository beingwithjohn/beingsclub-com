#!/usr/bin/env bash
#
# Create a run, and the people in it, on the live database.
#
#   ./seed/bootstrap.sh --run beyond-belief --name "Beyond Belief" …
#
# Everything after the script name is passed straight to seed/seed.js, so see
# the comment at the top of that file for the options.
#
# This exists so LINK_KEY is typed at a prompt rather than exported: an env var
# set on a command line ends up in shell history, in `ps` output while it runs,
# and in a screenshot of the terminal. Here it is read without echo, lives only
# in this process, and leaves with it.
#
# The SQL goes to a file only this user can read and is deleted on the way out,
# including if anything fails. The magic links are printed at the end, once the
# database has actually accepted them — so nothing is ever handed out that
# doesn't work.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -eq 0 ]; then
  echo "Nothing to seed. Pass the run, e.g.:" >&2
  echo '  ./seed/bootstrap.sh --run beyond-belief --name "Beyond Belief" \' >&2
  echo '    --fixed 2026-09-16 --days 35 --places 10 \' >&2
  echo '    --host "John Ooi <john@spacetobe.xyz> Europe/London"' >&2
  exit 1
fi

printf 'LINK_KEY (paste it — it will not appear): '
read -r -s LINK_KEY
printf '\n\n'

if [ -z "$LINK_KEY" ]; then
  echo "Nothing entered. Stopping." >&2
  exit 1
fi
export LINK_KEY
export APP_URL="${APP_URL:-https://beingsclub.com/log/}"

SQL="$(mktemp -t practice-log-seed)"
trap 'rm -f "$SQL"' EXIT
chmod 600 "$SQL"

# seed.js writes SQL on stdout and the links on stderr. Hold the links back
# until the database has taken the SQL.
echo "Building…"
LINKS="$(node seed/seed.js "$@" 2>&1 >"$SQL")"

echo "Applying to the live database…"
npx wrangler d1 execute practice-log --remote --file="$SQL" >/dev/null

echo
echo "$LINKS"
echo "Applied. Each link above is a login — send each one to its own person,"
echo "and to nobody else."
