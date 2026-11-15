# GNANOVA Manufacturing OS — Implementation Report

Built on the existing React 18 + TypeScript + Vite + Tailwind repository (no replacement project). All 11 original modules are kept; each original dashboard layout (KPI strip, line cards, alert feeds, AP's four tabs, health rings, SLA chart, report cards, assistant layout) was preserved and re-wired to computed data. See `docs/GAP_ANALYSIS.md` for the starting point and `docs/DEPLOYMENT.md` for go-live steps.

## 1. Architecture

```
React UI ──► useQuery / useActions ──► SyncEngine (offline queue, idempotent replay)
                                          │
                        ┌─────────────────┴──────────────────┐
                 DemoBackend (browser)                SupabaseBackend (live)
          DemoEngine: same rules as SQL            PostgREST + RLS + SQL triggers/RPCs
                                                   Storage (documents bucket)
                                                   Edge Functions (AI, OCR, dispatch, n8n, invite)
```

- **One entity registry** (`src/lib/data/entities.ts`) defines 39 masters/transactions: fields, validation, statuses, transitions, approval amount, editability. It drives forms, tables, cards, the demo engine and — via `npm run gen:sql` — the database rules (`…0350_config.sql`). A test fails if they drift.
- **Pure domain + analytics** (`domain.ts`, `analytics.ts`) compute OEE, 3-way match, FIFO, cover, ageing, scorecards. Shared by dashboards, reports, the AI assistant and tests.

## 2. Modules

| Module | Delivered |
| --- | --- |
| Overview | 12 KPIs, production / quality / inventory movement / procurement spend / plant-wise charts, exception & alert centre (17 rule types), module status, AI quick-ask; date, factory/plant, line, shift filters; KPIs hidden for modules the role cannot read |
| Sales & RFQ | Customer master; RFQ register + document intake; feasibility checks; quotation with costing and margin; approval; sent/accepted; **convert to sales order**; release SO to production; create delivery order; order tracking (ordered → produced → shipped → delivered) |
| Procurement | Requisitions & material requests; supplier quotations; **comparative statement** with supplier track record; raise PO from PR/quote; PO approval workflow; GRN from PO; supplier performance + purchase price variance; reorder recommendations → PR |
| AP Automation | Invoice queue with workflow steps; scan & upload (rule-based text parsing in demo, OCR/LLM in live); vendor identification by GSTIN/name; PO + GRN **3-way match**; exact-duplicate block + possible-duplicate flag; exception handling (override with reason, hold, query supplier by email, reject); approval with amount rules + maker-checker; payments (partial/full, never overpaid); AP ageing; vendor master with risk; AP audit trail |
| Production | Dashboard (line status, active orders vs plan-to-date, rule-based insights); production orders; schedule (Gantt); shift reports (mobile workflow); OEE by machine/line/shift/product with A·P·Q; downtime Pareto; raw-material consumption, WIP, FG output; full-screen **Andon** (auto-refresh) |
| Quality | Dashboard; incoming / in-process / final inspections; parameters & specs; defect classification; automatic NCR on rejection; CAPA; supplier quality grades; rejection trend; defect Pareto |
| Maintenance | Rule-based alerts (breakdown, overdue PM, low health score); machine register with history and health; PM schedules → work orders; breakdown reporting (machine → breakdown status + alert); technician allocation; spares consumption (stock OUT on completion); maintenance cost & downtime analysis |
| Inventory | Stock on hand (warehouse/bin/batch); stock IN/OUT/transfer/adjust; GRN posting; batch traceability; reservations; stock audit with system qty, variance and approved adjustment; min-stock/reorder alerts and "why at risk"; valuation; consumption analysis |
| Logistics | Dispatch planning with FG availability; delivery orders with challan, e-way bill (format-validated reference), LR; printable delivery challan; dispatch posts stock OUT; delay reporting + alert; POD upload; vehicles; transporters; carrier SLA and freight per shipment/unit |
| AI Assistant | Answers the 8 required questions and more (overdue bills, invoice exceptions, OEE, shipments, work orders, exceptions) from company data with tables, sources, period and next actions; says "not in your data" instead of guessing. Live: `ai-assistant` Edge Function with RLS-scoped facts |
| Reports | 11 reports (production, inventory, consumption, procurement, AP ageing, quality, utilization, OEE, maintenance, logistics, manufacturing cost) with date/plant/line/shift filters, Excel (CSV), PDF (print), run history, scheduling |
| **Field apps** (new) | Store keeper, production supervisor, maintenance technician, quality inspector — step-by-step, large touch targets, scan, photos, offline queue, honest confirmations |
| **Settings** (new) | Company profile & branding, thresholds, maker-checker; factories, lines, warehouses, bins, shifts, UOM, employees; users & roles (invite in live); permission matrix; approval rules; automation outbox with retry & delivery status; integration status; my notification preferences; audit log; JSON backup export; demo reset |

## 3. Database changes (`supabase/migrations`)

- 51 tables, every tenant table with `company_id`, **composite foreign keys** `(company_id, x_id) → (company_id, id)` so cross-company references are impossible even for system code, check constraints (quantities, dates, GSTIN, e-way bill, HH:MM), unique business keys and query indexes.
- Generic triggers: identity & server-managed fields, initial status, edit/delete rules by status, immutable ledgers, document numbering (`PO-2026-0001` per company), **audit log** with field-level diffs.
- Business triggers/RPCs: FIFO stock consumption with negative-stock prevention, stock balances, low-stock alerts, GRN posting (stock IN, PO received qty, incoming inspection), invoice 3-way match + duplicates, payments, shift-report effects (production order, FG stock, alerts), breakdown handling, work-order completion (spares OUT, machine status, PM next due), inspection → NCR, dispatch → stock OUT, SO status sync, `transition_status` with approval rules + maker-checker, quotation→SO, PR→PO, SO→production, SO→delivery, company registration, scheduled jobs, weekly report.
- **RLS on every table**; masters readable by members, transactions by module permission, writes by create/edit/delete permission, ledgers append-only, balances/audit/outbox read-only, notifications by role/user, storage by path `company_id/entity/record`.

## 4. APIs

- PostgREST tables (RLS-enforced) for all entities.
- RPCs: `transition_status`, `convert_quotation`, `create_po_from_requisition`, `create_production_orders_from_so`, `create_shipment_from_so`, `register_company`, `mark_notifications_read`, `set_notification_preference`, `retry_outbox`, `run_scheduled_jobs`, `my_permission`; service-role only: `claim_outbox`, `complete_outbox`, `run_scheduled_jobs_all`, `weekly_report_all`.
- Edge Functions: `ai-assistant`, `document-extract`, `invite-member`, `notify-dispatch`, `n8n-inbound` (HMAC).

## 5. Automation workflows

All 11 required workflows exist as event rules or schedules: low stock, purchase requisition, purchase approval, shift update, below target, high rejection, machine breakdown, PM reminders (+ auto work order), invoice approval, daily digest, weekly management report — plus shipment delay. Channels: in-app (always), WhatsApp and email per user preference, optional n8n webhook. Outbox gives delivery status, attempts, last error, exponential backoff, dead-letter and manual retry, all audited. n8n exports in `/n8n`.

## 6. Security improvements

- Multi-tenant isolation enforced in Postgres (RLS + composite FKs), not the UI.
- Role derived from membership server-side; 12 roles; permission matrix in `role_permissions` (per-company overridable).
- Clients cannot forge numbers, totals, status, payment or match fields; status changes only through `transition_status`.
- Maker-checker and amount-based approvers; last-admin and self-promotion guards; super-admin cannot be granted by companies.
- "System" context detected by executing role (`current_user`), not a spoofable setting.
- No secrets in the frontend; AI/WhatsApp/email/n8n keys only in Edge Function secrets; HMAC + replay window for n8n.
- CSV export guards against formula injection; uploads type- and size-checked client- and bucket-side.
- Honest UX: demo mode labelled everywhere; offline saves never shown as saved; AI never fabricates; unavailable integrations say so.

## 7. Testing results

| Gate | Result |
| --- | --- |
| TypeScript (`npm run typecheck`) | ✅ 0 errors |
| ESLint (`npm run lint`) | ✅ 0 errors (16 react-refresh warnings: files exporting hooks + components) |
| Production build (`npm run build`) | ✅ 11 s; initial JS ≈ 145 KB gzip, modules lazy-loaded |
| Unit + integration tests (`npm test`) | ✅ **69/69** |
| — Postgres (PGlite) RLS & business rules | 25 tests: isolation (read/insert/update/delete/FK/RPC/storage), RBAC, invite linking, escalation guards, negative stock, append-only ledgers, forged fields, maker-checker, approval thresholds, transitions, GRN posting, 3-way match, duplicates, payments, shift effects, NCR, outbox retry → dead-letter → manual retry, service-only functions |
| — Migrations / config drift | 2 tests (RLS on every table; generated SQL matches TS) |
| — Sync engine (offline) | 7 tests (queue, ordering, rejection, idempotent replay, persistence, tenant scoping) |
| — Domain, parsing, retry schedule | 14 tests |
| — Demo engine & AI assistant | 15 tests (8 required questions answered from data, refusal on unknown) |
| Edge Functions | ✅ `deno check` on all 5 |
| Browser — smoke | 82 module/tab routes rendered without errors or console errors (Company Admin) |
| Browser — RBAC | Store Keeper: 7 modules, AP denied, KPIs limited to permitted data |
| Browser — offline | Stock OUT offline → "Stored on this device", pending chip → auto-sync on reconnect → stock updated |
| Browser — PWA | Manifest 0 errors, 0 installability errors, SW active, full offline reload into an unvisited module |
| Browser — responsive | 360 / 390 / 430 / 768 / 1024 / 1440: no horizontal overflow on measured pages; found & fixed tab-strip page shift, filter widths, KPI label truncation, tablet grid gaps, action wrapping |

Issues found and fixed during testing: membership linking on sign-up, cross-unit quality rates (kg + pcs summed), KPI zeros shown to roles without access, future-dated seed events, sign-in flash, missing error boundary.

## 8. Deployment requirements

Supabase (Pro recommended), static HTTPS hosting, optional: OpenAI-compatible AI endpoint, WhatsApp Business Cloud API with an approved template, Resend (or swap provider in `_shared/dispatch.ts`), n8n. Full steps in `docs/DEPLOYMENT.md`.

## 9. Incomplete items and remaining blockers

| Item | Status / reason |
| --- | --- |
| Live mode end-to-end | **Not run** — no Supabase credentials or Docker in this environment. SQL is verified on real Postgres (PGlite) with Supabase stubs; the `SupabaseBackend` REST mapping and Auth flows are untested against a real project. First task after provisioning: run the app in live mode and repeat the browser checks. |
| Edge Functions, WhatsApp, email, n8n | Code complete and type-checked; **not executed** (no secrets/providers). n8n JSON is hand-authored and not yet imported into an instance. |
| AI | Demo uses deterministic analytics (no LLM). LLM answers and image/PDF extraction need `AI_API_KEY`. |
| Barcode scanning | Uses the browser `BarcodeDetector` (Chrome on Android, some desktops). iOS Safari falls back to manual entry or a USB/Bluetooth keyboard-wedge scanner. Not tested on physical devices. |
| File upload | Implemented (file + camera capture, IndexedDB in demo, Storage in live); storage policies tested in SQL. Not exercised by automated browser test (file pickers cannot be driven by the test tools). |
| Responsive sweep | Representative pages measured at all six widths; an automated all-routes × all-widths sweep was not permitted in this session. |
| Exports | Excel via UTF-8 CSV; PDF via browser print-to-PDF (no server-rendered PDF). Scheduled report delivery requires the automation backend. |
| Data model simplifications | Line items are JSONB (validated by trigger), no BOM/routing, so material consumption is issued (not back-flushed) and cost per unit excludes labour/energy/overhead; approvals are single-step per amount threshold (not multi-level chains); permission matrix is editable in SQL only; material UOM is free text. |
| Scale | Dashboards load up to 5,000 rows per table per window; for larger plants add server-side aggregate views/RPCs. No Supabase Realtime subscriptions yet (Andon polls every minute). |
| E-way bill / GST | Reference tracking only; no NIC/GSTN API integration. |
| Dependencies | `npm audit` reports 22 advisories inherited from the original lockfile's toolchain; review before production. |
