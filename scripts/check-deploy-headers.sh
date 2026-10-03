#!/usr/bin/env sh
# Post-deploy smoke: the health endpoint answers and the security headers are
# on a deployed link page (frontend-devops-conventions.md § CI Pipeline Shape,
# § Deploy Checklist Template; frontend-security-conventions.md § Default
# Headers; threat model F06c: no shared caching of /v/*).
#
#   sh scripts/check-deploy-headers.sh https://<deployment-host>
#
# For a deployment behind Vercel Deployment Protection, set
# VERCEL_AUTOMATION_BYPASS_SECRET; it's sent as x-vercel-protection-bypass.
# The slug page needn't exist: the headers come from next.config.ts and
# middleware.ts on every page response.
#
# EXPECT_PROTECTED=true: also check that a request *without* the bypass is
# refused (401/403). For generated *.vercel.app URLs, which run with real env
# and must stay behind Deployment Protection (Security DV-06). Not for the
# public production domain.
set -eu

base="${1:?Usage: check-deploy-headers.sh <base-url>}"
base="${base%/}"
page_path="${SMOKE_PAGE_PATH:-/v/loja-exemplo}"

fetch() {
  # $1: curl mode flags, $2: path
  # shellcheck disable=SC2086 # $1 is a space-separated list of curl flags
  if [ -n "${VERCEL_AUTOMATION_BYPASS_SECRET:-}" ]; then
    curl --silent --show-error --max-time 30 $1 \
      -H "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}" \
      "${base}$2"
  else
    curl --silent --show-error --max-time 30 $1 "${base}$2"
  fi
}

failed=0
fail() {
  echo "  FAIL: $1" >&2
  failed=1
}

echo "Smoke: ${base}/api/health"
health_status=$(fetch "--output /dev/null --write-out %{http_code}" /api/health)
[ "$health_status" = "200" ] || fail "/api/health answered ${health_status}, not 200"

if [ "${EXPECT_PROTECTED:-}" = "true" ]; then
  echo "Smoke: ${base} refuses a request without the bypass"
  anon_status=$(curl --silent --max-time 30 --output /dev/null --write-out '%{http_code}' "${base}/api/health")
  case "$anon_status" in
    401 | 403) ;;
    *) fail "an unauthenticated request got ${anon_status}, not 401/403: Deployment Protection is off" ;;
  esac
fi

echo "Smoke: security headers on ${base}${page_path}"
headers=$(fetch "--dump-header - --output /dev/null" "$page_path" | tr -d '\r' | tr '[:upper:]' '[:lower:]')

expect_header() {
  # $1: lower-case "name: value" fragment that must be present
  printf '%s\n' "$headers" | grep -qF -- "$1" || fail "missing header: $1"
}

expect_header "strict-transport-security: max-age=31536000; includesubdomains; preload"
expect_header "x-content-type-options: nosniff"
expect_header "referrer-policy: strict-origin-when-cross-origin"
expect_header "permissions-policy: camera=(), microphone=(), geolocation=(), payment=()"
expect_header "cross-origin-opener-policy: same-origin"
expect_header "x-frame-options: deny"
expect_header "x-robots-tag: noindex, nofollow"

csp=$(printf '%s\n' "$headers" | grep '^content-security-policy:' || true)
[ -n "$csp" ] || fail "missing header: content-security-policy"
for directive in "frame-ancestors 'none'" "'nonce-" "'strict-dynamic'" "object-src 'none'" "upgrade-insecure-requests"; do
  printf '%s' "$csp" | grep -qF -- "$directive" || fail "CSP lacks ${directive}"
done
printf '%s' "$csp" | grep -qF -- "'unsafe-eval'" && fail "CSP allows 'unsafe-eval'"

printf '%s\n' "$headers" | grep -q '^x-powered-by:' && fail "x-powered-by is present"
printf '%s\n' "$headers" | grep '^cache-control:' | grep -qF "no-store" ||
  fail "cache-control on ${page_path} lacks no-store (F06c)"

if [ "$failed" -ne 0 ]; then
  echo "Smoke FAILED for ${base}" >&2
  exit 1
fi
echo "Smoke: ${base} is healthy and sends the security headers."
