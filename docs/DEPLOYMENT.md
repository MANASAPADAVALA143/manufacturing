# GNANOVA Manufacturing OS — Deployment Guide

The app runs in two modes:

| Mode | When | Data | Security |
| --- | --- | --- | --- |
| **Demo** | `VITE_SUPABASE_*` not set (default) | Seeded, stored in the browser (localStorage + IndexedDB) | None — personas have no passwords. Never use for real data. |
| **Live** | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` set | Supabase Postgres + Storage | Supabase Auth + Row Level Security (company isolation, RBAC) |

## 1. Supabase project

1. Create a project at supabase.com (region close to your plants, e.g. `ap-south-1`). Use the **Pro** plan for production (daily backups + point-in-time recovery).
2. Install the CLI and link: `npm i -g supabase && supabase login && supabase link --project-ref <ref>`.
3. Apply the schema: `supabase db push`. This runs `supabase/migrations/*` in order:
   - `…0100_foundation` tenancy, RBAC helpers, generic guard / numbering / audit triggers
   - `…0200_tables` all business tables with company-scoped composite foreign keys and indexes
   - `…0300_automation` notifications, outbox, preferences, retry/backoff functions
   - `…0350_config` **generated** entity rules, status transitions, role permissions (`npm run gen:sql`)
   - `…0400_business` stock FIFO, GRN posting, 3-way match, payments, shift reports, transitions, RPCs
   - `…0500_rls` Row Level Security policies and grants
   - `…0600_storage` private `documents` bucket and storage policies
4. Auth settings (Dashboard → Authentication):
   - Site URL = your app URL; add it to redirect URLs.
   - Enable email confirmations. Optionally enable MFA and leaked-password protection.
   - Configure SMTP (Settings → Auth → SMTP) so invitation and reset emails come from your domain.
5. Do **not** expose the `service_role` key anywhere except Edge Function secrets.

## 2. Edge Functions & secrets

```bash
supabase secrets set APP_URL=https://app.example.com ALLOWED_ORIGINS=https://app.example.com
supabase secrets set AI_API_KEY=... AI_MODEL=gpt-4o-mini AI_VISION_MODEL=gpt-4o        # optional
supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... WHATSAPP_TEMPLATE=gnanova_alert
supabase secrets set RESEND_API_KEY=... EMAIL_FROM="GNANOVA <alerts@example.com>"
supabase secrets set N8N_SHARED_SECRET=$(openssl rand -hex 32)
supabase functions deploy ai-assistant document-extract invite-member notify-dispatch n8n-inbound
```

| Function | Auth | Purpose |
| --- | --- | --- |
| `notify-dispatch` | service role (cron) or user with `settings:edit` | Sends queued WhatsApp / email / webhook messages; retries 1, 4, 16, 64 min, dead-letters after 5 |
| `n8n-inbound` | HMAC (`x-gnanova-signature`, ±5 min) | Scheduled jobs, weekly report, dispatch, WhatsApp delivery receipts |
| `ai-assistant` | user JWT (RLS applies) | Grounded Q&A over the caller's company data |
| `document-extract` | user JWT | OCR + field extraction for invoices / RFQs; matches vendor, PO, materials |
| `invite-member` | user JWT + RLS | Adds a member and sends a Supabase Auth invite |

WhatsApp: create a Meta Business app, add the WhatsApp product, register the number, and get a **message template** approved with two body variables (`{{1}}` title, `{{2}}` body). Business-initiated messages outside the 24-hour window are rejected without a template.

## 3. n8n

1. Set environment on the n8n instance: `GNANOVA_FUNCTIONS_URL=https://<ref>.functions.supabase.co`, `GNANOVA_N8N_SECRET=<same as N8N_SHARED_SECRET>`, `WHATSAPP_VERIFY_TOKEN=<random>`, `NODE_FUNCTION_ALLOW_BUILTIN=crypto`.
2. Import `n8n/gnanova-scheduler.json` (dispatch every minute, daily digest + PM reminders 07:00, weekly report Monday 08:00) and activate it.
3. Import `n8n/gnanova-whatsapp-status.json`, then set the Meta webhook URL to the workflow's production URL with the verify token.
4. Optional: `n8n/gnanova-event-consumer.json` receives every event (set company setting `automation_webhook=true` and `N8N_WEBHOOK_URL` secret) for custom escalations.

Alternative to n8n for scheduling: Supabase Cron (`pg_cron`) calling `select public.run_scheduled_jobs_all();` daily and the `notify-dispatch` function every minute via `pg_net`.

## 4. Frontend

```bash
cp .env.example .env.production.local   # set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_APP_MODE=live, VITE_AI_ENABLED=true|false
npm ci && npm run build                  # output in dist/
```

Host `dist/` on any static host (Vercel, Netlify, Cloudflare Pages, S3 + CloudFront). Requirements:

- HTTPS (required for service workers, camera and barcode scanning).
- Serve `/sw.js` and `/index.html` with `Cache-Control: no-cache`; `/assets/*` can be `immutable, max-age=31536000`.
- Routing is hash-based (`/#/module/tab`), so no SPA rewrite rules are needed.
- Recommended headers: `Content-Security-Policy` allowing `self`, your Supabase domain, `fonts.googleapis.com`, `fonts.gstatic.com`; `Permissions-Policy: camera=(self)`; `Referrer-Policy: strict-origin-when-cross-origin`.

## 5. First company

1. Open the app → **Create an account** → confirm email → sign in.
2. **Register your company** (creates the company, you as Company Admin, a factory, shift, UOMs and a store).
3. Settings → add factories, production lines, warehouses, bins, shifts, employees; Inventory → material master; Maintenance → machines (set ideal cycle time for OEE); Procurement → suppliers; Sales → customers.
4. Settings → Approvals: add amount thresholds (e.g. POs ≥ ₹10 L need CEO).
5. Settings → Users & roles → **Invite user** for each person with the right role.
6. Each user: My notifications → enable WhatsApp / email for the alerts they need.

## 6. Backup & recovery strategy

| Layer | Mechanism | Frequency | Retention |
| --- | --- | --- | --- |
| Database | Supabase managed backups (Pro) + **PITR** add-on | continuous | 7–28 days |
| Database (off-site) | `supabase db dump --data-only` + schema dump from CI to an encrypted bucket in another region/provider | nightly | 90 days |
| Storage (`documents`) | Sync bucket to off-site object storage (`rclone` / S3 replication) | nightly | 90 days |
| Per-company export | Settings → Data & backup → JSON export (role-scoped) | on demand | — |
| Config | Migrations, functions and n8n workflows are in git | every change | — |

Run a **restore drill quarterly**: restore the nightly dump into a staging project, run `npm test` against it (the PGlite suite is schema-identical), and verify a sample of attachments.

## 7. Security checklist

- [ ] Only `VITE_SUPABASE_URL` and the anon key are in the frontend build.
- [ ] `service_role`, AI, WhatsApp, email and n8n secrets are only in `supabase secrets`.
- [ ] RLS is enabled on every public table (`supabase/tests/migrations.test.ts` asserts this).
- [ ] Email confirmation on; SMTP configured; MFA recommended for admins.
- [ ] `ALLOWED_ORIGINS` set to the production origin.
- [ ] Quarterly restore drill scheduled.
