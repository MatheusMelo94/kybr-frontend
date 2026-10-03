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

None yet. `lib/env.ts` (zod-validated) and `.env.example` come with task T02.

| Name | Public? | Purpose |
| ---- | ------- | ------- |
| —    | —       | —       |

## Routes

None yet. The seller link routes come with tasks T13, T20 and T32.

| Path | Auth | Description |
| ---- | ---- | ----------- |
| —    | —    | —           |

## Commands

| Command                         | What it does                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`                      | Dev server (Turbopack)                                                       |
| `pnpm build` / `pnpm start`     | Production build (webpack) and server                                        |
| `pnpm typecheck`                | `tsc --noEmit`                                                               |
| `pnpm lint`                     | ESLint over the repo                                                         |
| `pnpm test` / `pnpm test:watch` | Vitest, run once or in watch mode                                            |
| `pnpm test:e2e`                 | Playwright, all four projects. Use `--grep @feature-<slug>` for one feature. |

The suite check before every commit is `pnpm typecheck && pnpm lint && pnpm test`. Add `pnpm build` when a change touches `app/`, a `'use client'` boundary, `next.config.ts` or env.
