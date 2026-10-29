# Cognition Take-Home: Devin vs. Microsoft Power Apps

Build-vs-buy evaluation for a Series C fintech (~60 engineers) currently paying ~$250K/year for Microsoft Power Apps. They run 3 internal apps on it (KYC review queue, refunds dashboard, feature-flag admin panel) and plan to build 10+ more. The question is whether their team could use Devin to build these internal tools instead.

This repo will contain:

- **Prototype**: an internal-tools prototype built with Devin to show how it could replicate the core Power Apps functionality that matters to a fintech engineering team.
- **Key Decisions one-pager**: the scope, architecture, and tradeoffs behind the prototype.

See [instructions.md](./instructions.md) for the full assignment.

## Stack

Next.js 16 (App Router, TypeScript, Tailwind), Prisma 7 with SQLite (`better-sqlite3` driver adapter), Node 22.

## Running locally

The app lives in [`prototype/`](./prototype).

```bash
cd prototype
nvm use                      # Node 22 (see .nvmrc)
cp .env.example .env
npm install
npm run db:migrate           # creates ./dev.db and applies migrations
npm run dev                  # runs `prisma generate`, then http://localhost:3000
```

Checks: `npm run lint`, `npm run typecheck`, `npm run build`.
