# GNANOVA Manufacturing OS

**AI-Powered Manufacturing Operations & Business Intelligence** — one responsive, installable app for desktop, tablet and phone, covering sales, procurement, accounts payable, production, quality, maintenance, inventory, logistics, AI assistant and reports, for multiple companies with strict data isolation.

## Quick start (demo mode)

```bash
npm install
npm run dev          # http://localhost:5173
```

With no Supabase configured the app runs in **demo mode**: two seeded companies stored in your browser, with one-click personas for all 12 roles. Demo data is not secure — see live mode below.

## Live mode

Copy `.env.example` to `.env.local`, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, apply `supabase/migrations`, deploy `supabase/functions`. Full guide: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm run preview` | Production build (includes service worker) / serve it |
| `npm test` | Unit tests + Postgres (PGlite) RLS & business-rule tests |
| `npm run typecheck` / `npm run lint` | Type check / lint |
| `npm run gen:sql` | Regenerate `supabase/migrations/*_config.sql` from the entity registry |
| `npm run gen:icons` | Regenerate PWA icons |

## Layout

```
src/lib/data/        entity registry, backends (demo + Supabase), sync queue, hooks, seed
src/lib/             domain formulas, analytics, assistant, RBAC, automation events, router
src/components/      shell, UI kit, EntityManager, charts, scanner, attachments
src/components/modules/  Overview … Reports, Field Apps, Settings
supabase/            migrations, Edge Functions, PGlite tests
n8n/                 importable workflows
docs/                gap analysis, implementation report, deployment
```

Reports: [Gap analysis](docs/GAP_ANALYSIS.md) · [Implementation report](docs/IMPLEMENTATION_REPORT.md)
