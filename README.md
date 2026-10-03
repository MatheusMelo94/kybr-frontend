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

Not set up yet. A standalone `Dockerfile` comes with the DevOps project setup. `next.config.ts` already builds with `output: 'standalone'`.

## Environment variables

Copy `.env.example` to `.env.local` (gitignored). `lib/env.ts` validates every variable with zod, and `pnpm build` and `pnpm start` fail on a missing or invalid one. There are no `NEXT_PUBLIC_*` variables.

| Name                      | Public?          | Purpose                                                                                                                                                 |
| ------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API_BASE_URL`            | No               | Kybr API base URL for calls from the Next.js server. Must be `https:` in production.                                                                    |
| `API_ALLOW_LOOPBACK_HTTP` | No               | `true` lets a local or E2E production build use an `http:` loopback `API_BASE_URL` (the mock API). Never set when deployed.                             |
| `API_PUBLIC_BASE_URL`     | Yes (not secret) | Kybr API base URL the browser uploads documents to (ADR-0004b). Must be `https:` in production; a loopback URL is accepted for local production builds. |
| `API_BFF_KEY`             | **No, secret**   | Server-to-server key sent as `X-Kybr-BFF-Key`. Required in production, at least 32 characters.                                                          |
| `CLIENT_IP_HEADER`        | No               | Header the host fills with the real client IP. Required, with no default: it depends on the host.                                                       |
| `CLIENT_IP_TRUSTED_HOPS`  | No               | For `x-forwarded-for` only: how many trusted proxies append to it. The client IP is that many entries from the right.                                   |

## Routes

The seller link routes come with tasks T13, T20 and T32. Every page renders per request, because the CSP carries a fresh nonce (`middleware.ts`).

| Path                     | Auth                            | Description                                                                                                       |
| ------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/` and any unknown path | Public                          | "Link não encontrado" (404). The root has no screen.                                                              |
| `/v/{slug}`              | Public (the slug is the access) | Seller sign-up form. A malformed slug is a 404; an unknown or disabled one shows "Link não encontrado" (noindex). |

## Commands

| Command                         | What it does                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm dev`                      | Dev server (Turbopack)                                                             |
| `pnpm build` / `pnpm start`     | Production build (webpack) and server                                              |
| `pnpm typecheck`                | `tsc --noEmit`                                                                     |
| `pnpm lint`                     | ESLint over the repo                                                               |
| `pnpm test` / `pnpm test:watch` | Vitest, run once or in watch mode                                                  |
| `pnpm test:e2e`                 | Playwright, all four projects. Use `--grep @feature-<slug>` for one feature.       |
| `pnpm check:bundle`             | After `pnpm build`: fails if a route's First Load JS is over `bundle-budget.json`  |
| `pnpm check:secrets`            | After `pnpm build`: greps the build output for secret prefixes and `BUNDLE_CANARY` |

The suite check before every commit is `pnpm typecheck && pnpm lint && pnpm test`. Add `pnpm build` when a change touches `app/`, a `'use client'` boundary, `next.config.ts` or env.

## CI

`.github/workflows/ci.yml` runs on every push, on Node 22 with the pinned pnpm:

1. **verify:** `pnpm install --frozen-lockfile`, `typecheck`, `lint`, `test`, a production `build` with placeholder env, then `check:bundle` and `check:secrets`.
2. **audit:** `pnpm audit --audit-level=high`. Reviewed exceptions are in `pnpm-workspace.yaml` (`auditConfig.ignoreGhsas`), each with a reason and a revisit date.
3. **e2e:** after verify passes, Playwright once per project (chromium-desktop, chromium-mobile, webkit-mobile, firefox-desktop) against the mock API. On failure the report is uploaded as an artifact.

Bundle budgets in `bundle-budget.json` belong to the Frontend Architect (ADR-0003: 130 kB gzip on `/v/*`, 180 kB elsewhere). Change them only by plan or ADR, never to make CI green. Actions are pinned to commit SHAs; Dependabot (`.github/dependabot.yml`) proposes grouped weekly updates. There is no deploy workflow yet.
