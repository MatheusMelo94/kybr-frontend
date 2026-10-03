#!/usr/bin/env sh
# Secret grep of the build output (frontend-security-conventions.md § Secrets &
# Environment; frontend-devops-conventions.md § Secrets Integration). Run it
# after `pnpm build`.
#
# Fails when the client bundle (.next/static) or the server output
# (.next/standalone, outside node_modules) contains a known secret prefix, or
# the sentinel value in BUNDLE_CANARY. CI builds with API_BFF_KEY set to that
# sentinel: if it ever appears in the output, a server secret was inlined.
set -eu

targets=""
for dir in .next/static .next/standalone; do
  [ -d "$dir" ] && targets="$targets $dir"
done
if [ -z "$targets" ]; then
  echo "Secret grep: no build output found. Run \`pnpm build\` first." >&2
  exit 1
fi

# Vendor key prefixes (Stripe-style sk_live_/sk_test_) and PEM private keys.
pattern='(^|[^A-Za-z0-9_])(sk_live_|sk_test_)[A-Za-z0-9]|-----BEGIN ([A-Z]+ )*PRIVATE KEY-----'

found=0
# shellcheck disable=SC2086 # targets is a space-separated list of directories
if grep -rlE --exclude-dir=node_modules "$pattern" $targets; then
  echo "Secret grep FAILED: a known secret prefix is in the build output (files above)." >&2
  found=1
fi

if [ -n "${BUNDLE_CANARY:-}" ]; then
  # shellcheck disable=SC2086
  if grep -rlF --exclude-dir=node_modules "$BUNDLE_CANARY" $targets; then
    echo "Secret grep FAILED: the API_BFF_KEY sentinel is in the build output (files above)." >&2
    found=1
  fi
else
  echo "Secret grep: BUNDLE_CANARY not set; checking known prefixes only."
fi

if [ "$found" -ne 0 ]; then
  exit 1
fi
echo "Secret grep: clean ($targets )."
