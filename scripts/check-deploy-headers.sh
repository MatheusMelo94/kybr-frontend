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
# refused (401/403) or sent to Vercel's login (302/307 to
# https://vercel.com/sso-api). For generated *.vercel.app URLs, which run
# with real env and must stay behind Deployment Protection (Security DV-06).
# Not for the public production domain.
#
# EXPECT_SINGLE_HSTS=true: the response has exactly one Strict-Transport-
# Security field, with our value (Security DV-07). For the production domain;
# Vercel may add its own on *.vercel.app.
#
# EXPECT_UNKNOWN_HOST=true: base is a host the app doesn't serve (a staged
# production build's *.vercel.app URL: ADR-0008 rule 4, P03.1). Health must
# answer and every page must be a 404; the page headers aren't checked.
#
# PANEL_URL=https://app.kybr.com.br: also check the panel host's headers on
# /entrar (ADR-0008 rule 9: private, no-store; noindex; a CSP whose
# connect-src is 'self' only, and worker-src 'self' for Lote: ADR-0012).
# Unset while the panel is dark. The link page's CSP must have no
# worker-src either way.
set -eu

base="${1:?Usage: check-deploy-headers.sh <base-url>}"
base="${base%/}"
page_path="${SMOKE_PAGE_PATH:-/v/loja-exemplo}"

fetch_url() {
  # $1: curl mode flags, $2: absolute URL
  # shellcheck disable=SC2086 # $1 is a space-separated list of curl flags
  if [ -n "${VERCEL_AUTOMATION_BYPASS_SECRET:-}" ]; then
    curl --silent --show-error --max-time 30 $1 \
      -H "x-vercel-protection-bypass: ${VERCEL_AUTOMATION_BYPASS_SECRET}" \
      "$2"
  else
    curl --silent --show-error --max-time 30 $1 "$2"
  fi
}

fetch() {
  # $1: curl mode flags, $2: path on base
  fetch_url "$1" "${base}$2"
}

failed=0
fail() {
  echo "  FAIL: $1" >&2
  failed=1
}

finish() {
  if [ "$failed" -ne 0 ]; then
    echo "Smoke FAILED for ${base}" >&2
    exit 1
  fi
  echo "Smoke: ${base} is healthy and sends the expected headers."
  exit 0
}

echo "Smoke: ${base}/api/health"
health_status=$(fetch "--output /dev/null --write-out %{http_code}" /api/health)
[ "$health_status" = "200" ] || fail "/api/health answered ${health_status}, not 200"

if [ "${EXPECT_PROTECTED:-}" = "true" ]; then
  echo "Smoke: ${base} refuses a request without the bypass"
  # Vercel Authentication answers an anonymous request with a 302/307 to its
  # login (Location: https://vercel.com/sso-api?url=…), or 401/403 for other
  # protection methods. %{redirect_url} is curl's parse of the Location header
  # (made absolute, never followed). Any other answer, including a 200 or a
  # redirect elsewhere, means the deployment is open.
  anon=$(curl --silent --max-time 30 --output /dev/null \
    --write-out '%{http_code} %{redirect_url}' "${base}/api/health")
  anon_status=${anon%% *}
  anon_location=${anon#* }
  case "$anon_status" in
    401 | 403) ;;
    302 | 307)
      case "$anon_location" in
        https://vercel.com/sso-api | "https://vercel.com/sso-api?"* | https://vercel.com/sso-api/*) ;;
        *) fail "an unauthenticated request got ${anon_status} to somewhere other than Vercel's login: Deployment Protection is off" ;;
      esac
      ;;
    *) fail "an unauthenticated request got ${anon_status}, not 401/403 or a redirect to Vercel's login: Deployment Protection is off" ;;
  esac
fi

if [ "${EXPECT_UNKNOWN_HOST:-}" = "true" ]; then
  echo "Smoke: ${base} is an unknown host (ADR-0008 rule 4): every page answers 404"
  for path in "$page_path" / /entrar; do
    status=$(fetch "--output /dev/null --write-out %{http_code}" "$path")
    [ "$status" = "404" ] || fail "${path} answered ${status} on an unknown host, not 404"
  done
  finish
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

if [ "${EXPECT_SINGLE_HSTS:-}" = "true" ]; then
  hsts_fields=$(printf '%s\n' "$headers" | grep '^strict-transport-security:' || true)
  [ "$hsts_fields" = "strict-transport-security: max-age=31536000; includesubdomains; preload" ] ||
    fail "expected exactly one Strict-Transport-Security field with our value"
fi

csp=$(printf '%s\n' "$headers" | grep '^content-security-policy:' || true)
[ -n "$csp" ] || fail "missing header: content-security-policy"
for directive in "frame-ancestors 'none'" "'nonce-" "'strict-dynamic'" "object-src 'none'" "upgrade-insecure-requests"; do
  printf '%s' "$csp" | grep -qF -- "$directive" || fail "CSP lacks ${directive}"
done
printf '%s' "$csp" | grep -qF -- "'unsafe-eval'" && fail "CSP allows 'unsafe-eval'"
# ADR-0012 item 7 / Security C5: the parser worker's worker-src is the
# panel host's alone; the link never runs a worker.
printf '%s' "$csp" | grep -qF -- "worker-src" && fail "CSP on the link host has a worker-src"

printf '%s\n' "$headers" | grep -q '^x-powered-by:' && fail "x-powered-by is present"
printf '%s\n' "$headers" | grep '^cache-control:' | grep -qF "no-store" ||
  fail "cache-control on ${page_path} lacks no-store (F06c)"

# Security M5C-01 (C1, C3), on the platform itself, not only `next start`:
# - C1: middleware answers 411 to a Server Action POST without
#   Content-Length and 413 over 1 MiB (off the panel's /lote). A small
#   action must get past it: if the edge ever dropped Content-Length,
#   every action on both hosts would be a 411. The action id is a dummy:
#   middleware decides before Next resolves it, so anything but 411/413
#   (the unknown action's own answer) proves the header arrived.
# - C3: /_next/static carries the no-egress policy the parser worker runs
#   under (next.config.ts), also when the CDN serves it.
action_tmp=$(mktemp -d)
trap 'rm -rf "$action_tmp"' EXIT
printf '[]' > "${action_tmp}/small"
head -c 1572864 /dev/zero | tr '\0' 'a' > "${action_tmp}/big"
ACTION_ID=0000000000000000000000000000000000000000

action_status() {
  # $1: absolute URL, $2: body file
  fetch_url "--output /dev/null --write-out %{http_code} -X POST -H next-action:${ACTION_ID} -H content-type:text/plain;charset=UTF-8 --data-binary @$2" "$1"
}

echo "Smoke: a small Server Action POST on ${base}${page_path} gets past the body cap"
small_status=$(action_status "${base}${page_path}" "${action_tmp}/small")
case "$small_status" in
  411) fail "a small Server Action got 411: Content-Length doesn't reach middleware, so every action fails (C1)" ;;
  413) fail "a small Server Action got 413 (C1 cap misfires)" ;;
esac

echo "Smoke: a 1.5 MB Server Action POST on ${base}${page_path} gets 413"
big_status=$(action_status "${base}${page_path}" "${action_tmp}/big")
[ "$big_status" = "413" ] || fail "a 1.5 MB Server Action on ${page_path} answered ${big_status}, not 413 (C1)"

chunk=$(fetch "" "$page_path" | grep -o '/_next/static/chunks/[A-Za-z0-9._/-]*\.js' | head -n 1 || true)
if [ -z "$chunk" ]; then
  fail "no /_next/static chunk found on ${page_path} to check its CSP (C3)"
else
  echo "Smoke: the worker CSP on ${base}${chunk}"
  static_csp=$(fetch "--head --dump-header - --output /dev/null" "$chunk" | tr -d '\r' | tr '[:upper:]' '[:lower:]' | grep '^content-security-policy:' || true)
  for directive in "default-src 'none'" "script-src 'self'"; do
    printf '%s' "$static_csp" | grep -qF -- "$directive" || fail "/_next/static lacks the no-egress CSP (${directive}) (C3)"
  done
fi

if [ -n "${PANEL_URL:-}" ]; then
  panel="${PANEL_URL%/}"
  echo "Smoke: panel headers on ${panel}/entrar"
  panel_headers=$(fetch_url "--dump-header - --output /dev/null" "${panel}/entrar" | tr -d '\r' | tr '[:upper:]' '[:lower:]')
  panel_has() {
    printf '%s\n' "$panel_headers" | grep -qF -- "$1" || fail "panel: missing header: $1"
  }
  panel_has "strict-transport-security: max-age=31536000; includesubdomains; preload"
  panel_has "x-content-type-options: nosniff"
  panel_has "x-robots-tag: noindex, nofollow"
  panel_has "cache-control: private, no-store"
  panel_csp=$(printf '%s\n' "$panel_headers" | grep '^content-security-policy:' || true)
  [ -n "$panel_csp" ] || fail "panel: missing header: content-security-policy"
  for directive in "frame-ancestors 'none'" "'nonce-" "'strict-dynamic'" "connect-src 'self';"; do
    printf '%s' "$panel_csp" | grep -qF -- "$directive" || fail "panel: CSP lacks ${directive} (the panel browser never calls the API)"
  done
  # Lote's parser worker (ADR-0012 item 7, Security C5): with
  # 'strict-dynamic', a same-origin worker needs worker-src 'self', and it
  # is on every panel document (a soft navigation to /lote keeps the first
  # document's policy). Never blob:. /lote itself needs a session (a 307
  # with no policy), so /entrar stands for it.
  printf '%s' "$panel_csp" | grep -qF -- "worker-src 'self'" || fail "panel: CSP lacks worker-src 'self' (Lote's parser worker)"
  printf '%s' "$panel_csp" | grep -qE -- "worker-src[^;]*blob:" && fail "panel: worker-src allows blob:"
  echo "Smoke: a 1.5 MB Server Action POST on ${panel}/fila gets 413"
  panel_big=$(action_status "${panel}/fila" "${action_tmp}/big")
  [ "$panel_big" = "413" ] || fail "panel: a 1.5 MB Server Action on /fila answered ${panel_big}, not 413 (C1)"
fi

finish
