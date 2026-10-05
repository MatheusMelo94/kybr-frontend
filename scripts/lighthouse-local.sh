#!/usr/bin/env sh
# Lighthouse CI against a production build on the local mock API, the same
# way the E2E job runs the app (playwright.config.ts › webServer): the MSW
# mock API, then `next build` + `next start` pointed at it. Previews have no
# API until the backend exists (ADR-0005), so this is where ADR-0003's lab
# budgets are measured. lighthouserc.json holds the assertions.
#
#   sh scripts/lighthouse-local.sh
#
# Ports: APP_PORT (default 3000), MOCK_API_PORT (default 4010). Chrome: the
# runner's, or CHROME_PATH. Set SKIP_BUILD=1 to reuse an existing .next/.
set -eu
cd "$(dirname "$0")/.."

app_port="${APP_PORT:-3000}"
mock_port="${MOCK_API_PORT:-4010}"
app_url="http://localhost:${app_port}"
mock_url="http://localhost:${mock_port}"

# The pages measured: the form (S1 link) and a decided case (S4).
form_path="/v/loja-exemplo"
case_path="/v/loja-exemplo/c/tokaprovado0000000000000"

# Same values as the E2E webServer. None is a secret: the BFF key only ever
# reaches the local mock API, and the loopback allowance is E2E-only (F08).
export API_BASE_URL="$mock_url"
export API_PUBLIC_BASE_URL="$mock_url"
export API_ALLOW_LOOPBACK_HTTP=true
export API_BFF_KEY=e2e-only-bff-key-for-the-local-mock-api
export CLIENT_IP_HEADER=x-forwarded-for
export CLIENT_IP_TRUSTED_HOPS=1
# The link on localhost, the panel on 127.0.0.1 (ADR-0008, as in E2E), with
# placeholder legal pages and Cloudflare's always-pass Turnstile test key.
export LINK_HOST="localhost:${app_port}"
export PANEL_HOST="127.0.0.1:${app_port}"
export LEGAL_TERMS_URL=https://example.invalid/termos
export LEGAL_PRIVACY_URL=https://example.invalid/privacidade
export LEGAL_TERMS_VERSION=lhci-1
export TURNSTILE_SITE_KEY=1x00000000000000000000AA
panel_url="http://127.0.0.1:${app_port}"
export NEXT_TELEMETRY_DISABLED=1

pids=""
cleanup() {
  for pid in $pids; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

wait_for() {
  # $1: URL that answers once the server is ready
  i=0
  until curl --silent --fail --output /dev/null "$1"; do
    i=$((i + 1))
    if [ "$i" -gt 120 ]; then
      echo "Timed out waiting for $1" >&2
      exit 1
    fi
    sleep 1
  done
}

MOCK_API_PORT="$mock_port" MOCK_API_ALLOWED_ORIGINS="$app_url" \
  node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/fixtures/msw/mock-api.ts &
pids="$pids $!"
wait_for "${mock_url}/__mock/health"

if [ "${SKIP_BUILD:-}" != "1" ]; then
  pnpm build
fi
node node_modules/next/dist/bin/next start --port "$app_port" &
pids="$pids $!"
wait_for "${app_url}/api/health"

# Mobile preset (lighthouserc.json): the link's pages, and /entrar, the
# panel's phone journey (ADR-0010: the e-mail deep link logs in on a phone).
pnpm lhci \
  --collect.url="${app_url}${form_path}" \
  --collect.url="${app_url}${case_path}" \
  --collect.url="${panel_url}/entrar"

# Desktop preset (lighthouserc.panel.json): the panel's desktop-first auth
# pages, LCP <= 2.5 s blocking (ADR-0010).
.github/deploy-tools/node_modules/.bin/lhci autorun --config=lighthouserc.panel.json \
  --collect.url="${panel_url}/entrar" \
  --collect.url="${panel_url}/cadastro"
