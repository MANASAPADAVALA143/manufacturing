# GNANOVA Manufacturing OS — Phase 1 Gap Analysis

Audit of the repository as cloned from `MANASAPADAVALA143/manufacturing` (commit `3c28b65`).

## Architecture as found

| Area | Finding |
| --- | --- |
| Stack | React 18 + TypeScript 5 + Vite 5 + Tailwind 3 + lucide-react. Generated with Bolt. |
| Routing | None. `App.tsx` switches modules from a `useState`; no deep links, browser back button leaves the app. |
| State / data | Every number, row and chart is a hard-coded constant inside the component file. |
| Supabase | `@supabase/supabase-js` is a dependency but is never imported. No client, no env vars, no schema, no migrations. |
| Auth / tenancy | None. "ABC Manufacturing — Demo" is a hard-coded string. No users, roles or company isolation. |
| Design system | Dark charcoal palette, `ui.tsx` with `Badge`, `StatCard`, `Panel`, `ClickableRow`, `InfoBox`, `BlueButton`, `OutlineButton`, `StatusDot`. Square-edged industrial look, Inter + JetBrains Mono. |
| Responsive | Off-canvas sidebar below `lg`. Wide tables rely on horizontal scrolling; AP tab bar squeezes four long labels into one row on phones; AI Assistant hides suggested prompts on mobile and uses a fixed `100vh` height. |
| PWA | No manifest, icons, or service worker. Favicon points at a missing `/vite.svg`. |
| Quality gates | `tsc` passes. ESLint fails with 11 unused-import errors. No tests. |

## Cross-cutting issues

1. **Fake success feedback.** Almost every action button calls `showToast('…')` and does nothing else ("Invoice approved anyway", "Escalation created", "Downloading … (PDF)", "Add Supplier dialog opened"). This violates the "no fake success notifications" requirement.
2. **Misleading "LIVE" labels.** AP Automation and Inventory are labelled LIVE / "Powered by AP InvoiceFlow AI" and the sidebar says "Live modules use real automation", but they are as static as the rest.
3. **Fabricated AI.** The AI Assistant claims "powered by Claude AI" and "has access to all live modules" but returns canned text matched by keyword, and pre-populates a fabricated conversation.
4. **No CRUD anywhere.** No create / edit / delete, no forms, no validation.
5. **No search / filter / sort / pagination** except a client-side search on the AP vendor table.
6. **No exports.** Report "Download" buttons only show a toast.
7. **Security.** Nothing to secure yet, but nothing designed for it: no auth, no RBAC, no data isolation, no audit trail.

## Module-by-module

| Module | Existing functionality | Static data | Dead / fake actions | Missing (vs brief) |
| --- | --- | --- | --- | --- |
| Overview | 5 KPI tiles, 6 module cards (navigate), alert feed, AI quick-ask | All | Quick-ask discards the typed prompt | 12 KPIs, 5 trend charts, plant-wise performance, exception centre, date/plant/factory/shift filters |
| Sales & RFQ | 4 KPIs, 3 RFQs, detail panel with fixed values for every RFQ | All | "Generate quotation" does nothing | Customer master, RFQ registration, document extraction, quotation costing/approval, SO conversion, order tracking |
| Procurement | KPIs, PO table, price anomalies, supplier performance | All | View / Match Invoice / Review / Negotiate / Approve Anyway → toast | PR, material requests, supplier master, supplier quotations, comparative statement, PO create/approve, GRN, PPV, reorder recommendations |
| AP Automation | 4 tabs: queue + workflow (only INV-10482), upload (file ignored, demo preview always shown, OCR result hard-coded at "94% confidence"), 3-way match (one fixed example), vendor master with search | All | Every action button → toast; "Add Supplier" → toast | Real upload + storage, extraction, vendor identification, PO/GRN matching computed from data, duplicate detection, approvals, payments, ageing, audit trail |
| Production | KPIs, 3 line cards, schedule table, 3 "AI" insights | All | — | Planning, production orders, scheduling, machine/shift-wise output, operator allocation, consumption, WIP, FG, scrap, downtime, OEE calculation, Andon, mobile shift reporting |
| Quality | KPIs, alerts, incoming inspection queue, insights | All | — | In-process / final inspection, parameters, defect classification, NCR, CAPA, supplier quality, trend analysis |
| Maintenance | KPIs, "predictive" alerts, WO table, health rings | All | Create Work Order / Schedule → toast | Machine master, PM schedules, WO lifecycle, breakdown reporting, technician allocation, spares consumption, history, cost, notifications |
| Inventory | 1 KPI, 3 alerts, fixed detail for Steel Coil A | All | — | RM/WIP/FG stock, warehouses, bins, stock in/out, transfers, reservations, batches, adjustments, audit, min-stock & reorder, valuation, consumption |
| Logistics | KPIs, shipment table, delay alerts, SLA chart, carrier table | All | View / Reassign Carrier → toast | Dispatch planning, delivery orders, vehicles, transporters, challans, e-way bill refs, POD, freight cost |
| AI Assistant | Chat UI, grouped prompts, typing indicator | Canned answers | Claims of live data access | Answers computed from authorised company data, insights, recommended actions, real LLM via secure backend |
| Reports | 6 report cards, recent list, scheduled list | All | Download / Generate / PDF → toast | Real report generation, filters, Excel/PDF export, schedule management |

## Implementation plan (as executed)

1. **Data platform** — typed entity registry; one `Backend` interface with two implementations: a local **Demo backend** (seeded, clearly labelled, two isolated demo companies) and a **Supabase backend** (RLS-enforced). All writes go through a sync engine that queues offline and replays on reconnect.
2. **Server-side rules** — Postgres triggers/RPCs for stock balances, GRN posting, invoice matching & duplicates, status transitions and approval rules, audit log, notification outbox. The demo backend mirrors the same rules so behaviour is identical.
3. **Shell** — navy/white enterprise theme by re-tokenising Tailwind (existing components re-colour without rewrites), hash router, collapsible sidebar, breadcrumbs, global search, notifications, user/company switcher, mobile bottom nav, offline/sync status.
4. **Generic UI** — `EntityManager` (responsive table ⇄ cards, search, filters, sort, pagination, create/edit/delete, validation, status transitions, attachments, audit history, CSV export).
5. **Modules** — keep each module's existing dashboard layout but feed it computed data; add tabs for the missing masters and transactions.
6. **Field apps** — four step-by-step mobile workflows.
7. **Admin** — company settings, masters, users/roles, approvals, notification preferences, automation outbox, integration status, backup export.
8. **PWA** — manifest, PNG icons, service worker, install prompt, offline handling.
9. **Backend artefacts** — SQL migrations, storage policies, edge functions, n8n workflows, RLS isolation tests.
