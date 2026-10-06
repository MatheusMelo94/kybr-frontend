#!/usr/bin/env sh
# The F3 documents-domain gate (T116; Security F3, D-C6). Run by hand against
# two fresh staging signed URLs, one for a PDF and one for a PNG, before
# PANEL_DOCUMENTS_MODE=redirect may ship to Production. Until it passes,
# Production stays on the F4 attachment fallback.
#
#   sh scripts/check-documents-domain.sh
#
# then paste the PDF URL and the PNG URL, one per line (not echoed on a
# terminal), or pipe them in. They are read from stdin, never argv: a signed
# URL is a bearer credential, and argv lands in shell history and in ps
# (M6C-09). Inside, they reach node and curl on stdin too.
#
# Each URL must answer 200 with:
# - X-Content-Type-Options: nosniff;
# - Content-Security-Policy with sandbox and default-src 'none';
# - Content-Disposition with a server-generated file name ([A-Za-z0-9._-]);
# - Cache-Control: private, no-store;
# - Cross-Origin-Resource-Policy: same-origin or same-site;
# - Referrer-Policy: no-referrer;
# - Content-Type application/pdf (the PDF) or image/png (the PNG).
# Both URLs sit on one https: origin whose registrable domain isn't
# kybr.com.br (CR-P7). DOCUMENTS_ORIGIN, when set, must be that origin (pass
# the value of PANEL_DOCUMENTS_ORIGIN). http: is allowed only on loopback with
# API_ALLOW_LOOPBACK_HTTP=true (QA Q1: the local mock's documents server).
#
# The request is a GET with the body discarded, not curl -I: a signed URL is
# usually signed for GET only, so a HEAD can fail on a correct domain.
# A signed URL is a bearer credential: this script prints its origin only,
# never a path or query. On a pass it prints the DOCUMENTS_DOMAIN_CHECKED_AT
# value to record in Vercel (docs/devops/vercel-setup.md).
set -eu

usage() {
  echo "Usage: check-documents-domain.sh, with the PDF and the PNG signed URLs on stdin, one per line (never as arguments)" >&2
  exit 2
}

# Arguments would already be in the shell history; refuse them unprinted.
[ "$#" -eq 0 ] || usage

if [ -t 0 ]; then
  echo "Paste the PDF signed URL, then the PNG signed URL, one per line:" >&2
  stty -echo
  trap 'stty echo' EXIT
  trap 'exit 130' INT TERM
fi
pdf_url="" png_url=""
IFS= read -r pdf_url || true
IFS= read -r png_url || true
[ -t 0 ] && stty echo
cr=$(printf '\r')
pdf_url=${pdf_url%"$cr"} png_url=${png_url%"$cr"}
[ -n "$pdf_url" ] && [ -n "$png_url" ] || usage

failed=0
fail() {
  echo "  FAIL: $1" >&2
  failed=1
}

# Prints "protocol origin hostname credentials" for a URL, or "invalid".
parse() {
  # The URL goes in on stdin, not argv (M6C-09).
  printf '%s' "$1" | node -e '
    try {
      const u = new URL(require("node:fs").readFileSync(0, "utf8"));
      const host = u.hostname.toLowerCase().replace(/\.$/, "");
      const creds = u.username !== "" || u.password !== "" ? "yes" : "no";
      console.log(`${u.protocol} ${u.origin} ${host} ${creds}`);
    } catch {
      console.log("invalid");
    }'
}

origin=""
check_target() {
  # $1: label, $2: URL. Sets origin; fails without fetching on a bad target.
  set -- "$1" $(parse "$2")
  label=$1
  if [ "$2" = "invalid" ]; then
    fail "${label}: not a URL"
    return
  fi
  protocol=$2 url_origin=$3 hostname=$4 creds=$5
  [ "$creds" = "no" ] || fail "${label}: the URL carries credentials"
  case "$hostname" in
    kybr.com.br | *.kybr.com.br)
      fail "${label}: ${hostname} is under kybr.com.br; the documents domain needs its own registrable domain (CR-P7)" ;;
  esac
  if [ "$protocol" != "https:" ]; then
    case "$hostname" in
      localhost | 127.0.0.1 | "[::1]") loopback=yes ;;
      *) loopback=no ;;
    esac
    [ "$loopback" = "yes" ] && [ "${API_ALLOW_LOOPBACK_HTTP:-}" = "true" ] ||
      fail "${label}: must be https: (http: only on loopback with API_ALLOW_LOOPBACK_HTTP=true)"
  fi
  if [ -z "$origin" ]; then
    origin=$url_origin
  elif [ "$url_origin" != "$origin" ]; then
    fail "${label}: both URLs must be on the same origin"
  fi
}

check_target PDF "$pdf_url"
check_target PNG "$png_url"
if [ -n "${DOCUMENTS_ORIGIN:-}" ] && [ "${DOCUMENTS_ORIGIN%/}" != "$origin" ]; then
  fail "the URLs' origin isn't DOCUMENTS_ORIGIN (${DOCUMENTS_ORIGIN})"
fi
if [ "$failed" -ne 0 ]; then
  echo "F3 documents-domain check FAILED for ${origin:-the given URLs}" >&2
  exit 1
fi

check_document() {
  # $1: label, $2: URL, $3: expected media type
  label=$1
  echo "F3: ${label} on ${origin}"
  # %{http_code} goes last, on its own line, after the headers.
  # The URL goes in as a curl config on stdin, not argv (M6C-09).
  response=$(printf 'url = "%s"\n' "$(printf '%s' "$2" | sed 's/[\\"]/\\&/g')" |
    curl --config - --silent --show-error --max-time 30 --dump-header - \
      --output /dev/null --write-out '\n%{http_code}' 2>/dev/null |
    tr -d '\r' | tr '[:upper:]' '[:lower:]') || true
  status=$(printf '%s\n' "$response" | tail -n 1)
  headers=$(printf '%s\n' "$response" | sed '$d')
  if [ "$status" != "200" ]; then
    fail "${label}: answered ${status}, not 200 (an expired signature? the URLs live <= 60 s)"
    return
  fi
  field() {
    # $1: header name; prints its value(s), or nothing
    printf '%s\n' "$headers" | sed -n "s/^$1: *//p"
  }
  [ "$(field x-content-type-options)" = "nosniff" ] ||
    fail "${label}: x-content-type-options must be nosniff"
  csp=$(field content-security-policy)
  [ -n "$csp" ] || fail "${label}: missing content-security-policy"
  if [ -n "$csp" ]; then
    printf '%s' "$csp" | grep -qE "(^|;) *sandbox *(;|$)" ||
      fail "${label}: content-security-policy lacks sandbox"
    printf '%s' "$csp" | grep -qF "default-src 'none'" ||
      fail "${label}: content-security-policy lacks default-src 'none'"
  fi
  disposition=$(field content-disposition)
  printf '%s' "$disposition" | grep -qE "^(inline|attachment); *filename=\"?[a-z0-9._-]+\"?$" ||
    fail "${label}: content-disposition needs a server-generated filename ([A-Za-z0-9._-] only)"
  cache=$(field cache-control)
  printf '%s' "$cache" | grep -qw private && printf '%s' "$cache" | grep -qw no-store ||
    fail "${label}: cache-control must be private, no-store"
  case "$(field cross-origin-resource-policy)" in
    same-origin | same-site) ;;
    *) fail "${label}: cross-origin-resource-policy must be same-origin or same-site" ;;
  esac
  [ "$(field referrer-policy)" = "no-referrer" ] ||
    fail "${label}: referrer-policy must be no-referrer"
  type=$(field content-type)
  [ "${type%%;*}" = "$3" ] || fail "${label}: content-type must be $3"
}

check_document PDF "$pdf_url" application/pdf
check_document PNG "$png_url" image/png

if [ "$failed" -ne 0 ]; then
  echo "F3 documents-domain check FAILED for ${origin}: keep PANEL_DOCUMENTS_MODE=attachment (F4) in Production." >&2
  exit 1
fi
checked_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "F3 documents-domain check PASSED for ${origin}."
echo "Record it in Vercel (Production, plain, not Sensitive):"
echo "  DOCUMENTS_DOMAIN_CHECKED_AT=${checked_at}"
