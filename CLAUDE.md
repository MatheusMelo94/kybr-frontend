# CLAUDE.md: kybr-frontend

Context for AI-assisted development in this repo.

## Project

- **What:** the Kybr frontend. v1 is the seller link (`/v/{slug}`, route group `(link)`). The panel (`(panel)`) comes later. Both live in one Next.js app.
- **Posture:** Production. CRITICAL and HIGH security findings block release.
- **Conventions:** the `solo-founder-dev-team-front` plugin: `frontend-architecture-conventions.md`, `design-conventions.md`, `frontend-security-conventions.md`, `frontend-qa-conventions.md` and `frontend-devops-conventions.md`. Cite their sections in commit bodies.

## Toolchain

- **Package manager:** pnpm, pinned by `packageManager` in `package.json` (use `corepack enable`). Never use npm or yarn here.
- **Dependency build scripts** are blocked. `pnpm-workspace.yaml` › `allowBuilds` is the explicit allow/deny list. Justify any `true` in the commit body.
- **Node:** 22 LTS is the target for CI and Docker. Newer local Node versions work.
- **Next.js:** stay on 15.x (latest patch, never below 15.2.3). A move to 16 needs an ADR.
- **Commands:** `pnpm typecheck && pnpm lint && pnpm test` on every change. Add `pnpm build` when a change touches `app/`, a `'use client'` boundary, `next.config.ts` or env. E2E runs with `pnpm test:e2e --grep @feature-seller-link`.

## Deploy target

**Vercel**, functions in São Paulo (`gru1`), per ADR-0005 (Proposed). Posture: Production.

- **Environments:** Local → the mock API (`pnpm mock:api`). Preview (staging, every pushed branch) → the hosted mock API while the backend is Pre-Contract, later backend staging. Production → `https://api.kybr.com.br` only, never a mock. Cross-wiring is a NO-GO, and `scripts/check-deploy-env.mjs` fails the deploy on it.
- **Client IP:** `CLIENT_IP_HEADER=x-vercel-forwarded-for` on Vercel, with no trusted hops. `lib/env-schema.ts` rejects any other header when `VERCEL=1` (threat model F02).
- **Deploys:** only from GitHub Actions. `ci.yml` calls `deploy-staging.yml` after every check passes. `deploy-prod.yml` is manual and off until `PRODUCTION_ENABLED`; it promotes a staged production build, never a new one. Vercel's Git integration is off.
- **Headers:** `next.config.ts` and `middleware.ts` are the only source. `vercel.json` sets none.
- **Fallback:** the `Dockerfile` (CI builds it and checks its health). Nothing deploys it.
- The user's manual setup is in `docs/devops/vercel-setup.md` (local only).

## Backend contract

Pre-Contract. No backend exists yet.

- The shapes the frontend expects are in `docs/specs/seller-link-verification/contract-request.md`.
- Code runs against the MSW handlers in `tests/fixtures/msw/handlers/seller-link.ts`, which arrive with task T07.
- Commits that consume a mocked endpoint carry the footer `Pre-Contract: [endpoint] mocked; reconcile when contract lands`.
- The contract of record will be the OpenAPI the backend publishes. All calls go through `https://api.kybr.com.br`.

## Local-only files (never stage or commit)

`docs/` (specs, plan, tasks, ADRs, DDRs, tech design) and the root brief `Kybr — frontend.md` are gitignored by the user's decision. Read them, but never stage them. Stage explicit paths and check `git status` first.

## Git

- `main` is push-protected. Each milestone gets its own branch (for example `chore/scaffold` or `feat/seller-link-form`), and the user merges.
- Commits use Conventional Commits, one per task, with convention citations and test counts in the body.
- Don't push. The user decides.
