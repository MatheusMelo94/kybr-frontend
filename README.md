# kybr-frontend

Frontend for Kybr, CNPJ verification for Brazilian marketplaces. It has two surfaces in one Next.js app:

- **Seller link** (`kybr.com.br/v/{slug}`): a public, phone-first page where a PJ seller verifies their company. This is v1, built in the `(link)` route group.
- **Panel** (`app.kybr.com.br`): the ops panel behind a login. It comes later, in the `(panel)` route group.

## Stack

| Concern                | Choice                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Framework              | Next.js 15 (App Router only), React 19                                                                                      |
| Language               | TypeScript 5, `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`                      |
| Styling                | Tailwind CSS 4 (CSS-first `@theme` in `app/globals.css`), with classes composed through `cn()` in `lib/utils.ts`            |
| Lint / format          | ESLint 9 flat config (`eslint-config-next` + the full `jsx-a11y` recommended set); Prettier + `prettier-plugin-tailwindcss` |
| Unit / component tests | Vitest + React Testing Library + jest-dom on jsdom                                                                          |
| E2E tests              | Playwright on chromium-desktop, chromium-mobile, webkit-mobile and firefox-desktop                                          |
| Runtime                | Node.js 22 LTS                                                                                                              |
| Package manager        | pnpm, pinned by `packageManager` in `package.json`                                                                          |

## Setup

### Local

```sh
corepack enable              # gives you the pnpm version pinned in package.json
pnpm install --frozen-lockfile
pnpm dev                     # http://localhost:3000
```

Dependency build scripts are blocked by default. The allowlist lives in `pnpm-workspace.yaml` under `allowBuilds`, and every entry there is a deliberate decision.

### Docker

Vercel is the host. The `Dockerfile` is the portable fallback (`output: 'standalone'`, non-root, `HEALTHCHECK` on `/api/health`); CI builds it and checks its health on every push.

```sh
docker build -t kybr-frontend .
docker run -p 3000:3000 --env-file .env.local kybr-frontend
```

Every variable is read at runtime. Off Vercel, choose `CLIENT_IP_HEADER` for the host's proxy chain and prove it with a spoof test first (threat model F02).

### One command

`./run-local.sh` installs from the lockfile, creates `.env.local` from `.env.example` if it's missing, and starts the mock API (:4010) and the dev server (:3000).

## Environment variables

Copy `.env.example` to `.env.local` (gitignored). `lib/env.ts` validates every variable with zod, and `pnpm build` and `pnpm start` fail on a missing or invalid one. There are no `NEXT_PUBLIC_*` variables.

| Name                      | Public?          | Purpose                                                                                                                                                 | Preview / Production (Vercel)                                             |
| ------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `API_BASE_URL`            | No               | Kybr API base URL for calls from the Next.js server. Must be `https:` in production.                                                                    | Preview: the hosted mock API. Production: `https://api.kybr.com.br` only. |
| `API_ALLOW_LOOPBACK_HTTP` | No               | `true` lets a local or E2E production build use an `http:` loopback `API_BASE_URL` (the mock API). Never set when deployed.                             | Never set (the deploy check fails).                                       |
| `API_PUBLIC_BASE_URL`     | Yes (not secret) | Kybr API base URL the browser uploads documents to (ADR-0004b). Must be `https:` in production; a loopback URL is accepted for local production builds. | Same origin as `API_BASE_URL`.                                            |
| `API_BFF_KEY`             | **No, secret**   | Server-to-server key sent as `X-Kybr-BFF-Key`. Required in production, at least 32 characters.                                                          | Sensitive in Vercel; a separate value per environment.                    |
| `CLIENT_IP_HEADER`        | No               | Header the host fills with the real client IP. Required, with no default: it depends on the host.                                                       | `x-vercel-forwarded-for` (enforced when `VERCEL=1`).                      |
| `CLIENT_IP_TRUSTED_HOPS`  | No               | For `x-forwarded-for` only: how many trusted proxies append to it. The client IP is that many entries from the right.                                   | Not set.                                                                  |

Deployed values live in Vercel's environment variables, per environment, never in a committed file (`.env.example` lists them per environment).

## Routes

The seller link routes come with tasks T13, T20 and T32. Every page renders per request, because the CSP carries a fresh nonce (`middleware.ts`).

| Path                     | Auth                            | Description                                                                                                       |
| ------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/` and any unknown path | Public                          | "Link não encontrado" (404). The root has no screen.                                                              |
| `/v/{slug}`              | Public (the slug is the access) | Seller sign-up form. A malformed slug is a 404; an unknown or disabled one shows "Link não encontrado" (noindex). |

## Commands

| Command                                              | What it does                                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                           | Dev server (Turbopack)                                                                                   |
| `pnpm build` / `pnpm start`                          | Production build (webpack) and server                                                                    |
| `pnpm typecheck`                                     | `tsc --noEmit`                                                                                           |
| `pnpm lint`                                          | ESLint over the repo                                                                                     |
| `pnpm test` / `pnpm test:watch`                      | Vitest, run once or in watch mode                                                                        |
| `pnpm test:e2e`                                      | Playwright, all four projects. Use `--grep @feature-<slug>` for one feature.                             |
| `pnpm check:bundle`                                  | After `pnpm build`: fails if a route's First Load JS is over `bundle-budget.json`                        |
| `pnpm check:secrets`                                 | After `pnpm build`: greps the build output for secret prefixes and `BUNDLE_CANARY`                       |
| `pnpm check:deploy-env <file> <preview\|production>` | Checks a `vercel env pull` file: no cross-wiring, no `API_ALLOW_LOOPBACK_HTTP`, `x-vercel-forwarded-for` |
| `pnpm check:deploy-headers <url>`                    | Post-deploy smoke: `/api/health` and the security headers on a `/v/*` page                               |
| `pnpm lhci --collect.url=<url>`                      | Lighthouse CI (`lighthouserc.json`) from the pinned `.github/deploy-tools`                               |

The suite check before every commit is `pnpm typecheck && pnpm lint && pnpm test`. Add `pnpm build` when a change touches `app/`, a `'use client'` boundary, `next.config.ts` or env.

## CI

`.github/workflows/ci.yml` runs on every push, on Node 22 with the pinned pnpm:

1. **verify:** `pnpm install --frozen-lockfile`, `typecheck`, `lint`, `test`, a production `build` with placeholder env, then `check:bundle` and `check:secrets`.
2. **audit:** `pnpm audit --audit-level=high`. Reviewed exceptions are in `pnpm-workspace.yaml` (`auditConfig.ignoreGhsas`), each with a reason and a revisit date.
3. **e2e:** after verify passes, Playwright once per project (chromium-desktop, chromium-mobile, webkit-mobile, firefox-desktop) against the mock API. On failure the report is uploaded as an artifact.

4. **container:** builds the `Dockerfile`, waits for its health check, and fails if it runs as root.
5. **deploy-staging:** after all of the above, on pushes only, once the `VERCEL_DEPLOY_ENABLED` repository variable is `true`: `.github/workflows/deploy-staging.yml` deploys a Vercel Preview, smokes it and runs Lighthouse CI on it.

Bundle budgets in `bundle-budget.json` belong to the Frontend Architect (ADR-0003: 130 kB gzip on `/v/*`, 180 kB elsewhere). Change them only by plan or ADR, never to make CI green. The same goes for the Lighthouse thresholds in `lighthouserc.json`. Actions are pinned to commit SHAs; Dependabot (`.github/dependabot.yml`) proposes grouped weekly updates.

## Deploy

Vercel, functions in São Paulo (`gru1`). Deploys come only from GitHub Actions; Vercel's Git integration is off (`vercel.json`). Security headers come from `next.config.ts` and `middleware.ts` only.

| Environment       | When                                                                    | API                                                   | How                                                                                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preview (staging) | Every pushed branch, after CI is green                                  | Hosted mock API (Pre-Contract), later backend staging | `deploy-staging.yml`: env check, `vercel deploy` (built on Vercel), health and header smoke, Lighthouse CI                                                                                           |
| Production        | Manual, from `main` (`deploy-prod.yml`), off until `PRODUCTION_ENABLED` | `https://api.kybr.com.br` only                        | Gate (owner, tag typed twice, GO Deploy Checklist, green CI on the SHA), staged production build (`--prod --skip-domain`) and smoke, `vercel promote`, domain check, automatic rollback, release tag |

Rollback: `vercel rollback <last-known-good deployment id>` (in the deploy run's summary). It re-points the domain without a rebuild. The GitHub secrets are `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` and `VERCEL_AUTOMATION_BYPASS_SECRET`; the app's own variables live in Vercel, per environment.
