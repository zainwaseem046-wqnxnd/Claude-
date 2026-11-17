# CleaningProof

Mobile-first SaaS for small UK commercial cleaning companies to **prove contracted cleaning was done**:
a cleaner completes a visit report on their phone in about two minutes (checklist, before/after photos, issues),
and the business gets a branded PDF and a private link to share with the client.

**Stack:** React + TypeScript + Tailwind (Vite) · Node/Express + TypeScript · PostgreSQL · pdfkit · Stripe (test mode first) · Nodemailer (SMTP)

## Features

| Area | What works |
|---|---|
| Accounts | Sign-up/login, bcrypt passwords, httpOnly session cookies (hashed in DB), business details & logo |
| Data isolation | Every query is scoped to the logged-in user's `business_id`; cross-tenant access returns 404 |
| Sites | Name, address, contact, email, frequency, site-specific areas + checklist (with Office/Communal/Gym/Shop templates), archive/restore |
| Visit form | Site picker → draft created → autosave; areas, checklist, tasks not completed + required reason, issues, notes, before/after photos (compressed & EXIF-stripped on the phone) |
| PDF reports | Branded A4 PDF: logo, business & site details, date/time, completed checklist, outstanding tasks, issues, notes, photos, cleaner name |
| Dashboard | Live counts: total visits, completed this month, sites serviced, outstanding issues, drafts awaiting submission, recent reports |
| History | Search, filter by site and date range, view, download PDF, resend by email, mark issues resolved |
| Client sharing | Private 192-bit random link per report, viewable without an account, revocable; exposes only that report |
| Pricing/billing | Starter £19 / Professional £29 / Business £49 via Stripe Checkout + Billing Portal + webhooks; plan limits enforced server-side |
| Business plan | Multiple cleaner logins (restricted role), CSV export, per-site 30-day completion stats |

### Plan limits (server-enforced, `server/lib/plans.ts`)

| | Trial (14 days) | Starter | Professional | Business |
|---|---|---|---|---|
| Active sites | 20 | 5 | 20 | 100 |
| Logo on reports | ✓ | – | ✓ | ✓ |
| Client share links | ✓ | – | ✓ | ✓ |
| Users | 1 | 1 | 1 | 15 |
| CSV export & site stats | – | – | – | ✓ |

When a trial ends or a subscription lapses, existing reports stay viewable/downloadable, but new sites and visits are blocked until a plan is chosen.

## Security notes

- **Photos and logos** are stored in `UPLOAD_DIR` (outside the web root) with random file names and `0600` permissions. They are only served through authenticated, tenant-checked routes, or through the share-token route for that one report.
- **Uploads:** max 8 MB, JPEG/PNG only, verified by magic bytes (not file extension or the client's MIME type); max 8 before + 8 after photos per visit.
- **CSRF:** cookies are `SameSite=Lax` and every state-changing API call must send `X-Requested-With: cleaningproof`.
- **Validation:** all input is checked with zod on the server; queries are parameterised; CSV export neutralises spreadsheet formulas.
- **Other protections:** Helmet with a strict CSP, rate-limited auth and public endpoints, constant-time-ish login, and `noindex` on shared reports.
- **Payments:** live Stripe keys (`sk_live_…`) are **refused** unless `STRIPE_ALLOW_LIVE=true`.

## Local development

Requirements: Node ≥ 20, PostgreSQL ≥ 14.

```bash
npm install
cp .env.example .env          # set DATABASE_URL, UPLOAD_DIR, STRIPE_SECRET_KEY (sk_test_…)
npm run migrate               # creates tables (also runs automatically on server start)
npm run dev                   # API on :3000, web on http://localhost:5173 (proxies /api)
```

Without SMTP settings in development, emails are logged to the console instead of sent.

### Tests

```bash
npm run typecheck
npm run build && npm start &          # or npm run dev
BASE_URL=http://localhost:3000 npm run test:e2e
```

The smoke test (`scripts/smoke-test.ts`) runs about 50 end-to-end API checks against a real server. They cover:
- auth and CSRF
- tenant isolation for sites, visits, photos and PDFs
- upload restrictions
- the visit lifecycle and PDF generation
- search and filters
- share links, including revoking them and keeping one token from reaching another report
- email, issues and plan gating

## Deployment

Any Node host with PostgreSQL and a **persistent disk** for uploads works (Render, Railway, Fly.io, a VPS). Example: **Render**.

1. **Database:** create a PostgreSQL instance. Copy its internal connection string.
2. **Web service** from this repo:
   - Build command: `npm ci --include=dev && npm run build`
   - Start command: `npm start`
   - Add a **persistent disk** mounted at e.g. `/var/data`, and set `UPLOAD_DIR=/var/data/uploads`.
3. **Environment variables** (see `.env.example`):
   - `NODE_ENV=production`, `DATABASE_URL`, `UPLOAD_DIR`, `APP_URL=https://your-domain`
   - `PGSSLMODE=require` if your provider requires SSL
   - `STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (Postmark, SendGrid, Mailgun, Amazon SES…). Without SMTP in production, "Send" returns a clear error and the share link / PDF download still work.
4. The schema migrates automatically on start. Check `GET /api/health`.
5. Put the service behind HTTPS (the default on these hosts). Cookies are `Secure` in production.

### Stripe (test mode first)

1. In the Stripe Dashboard with **Test mode on**, copy the test secret key (`sk_test_…`) into `STRIPE_SECRET_KEY`.
2. Optional: create three monthly GBP prices and set `STRIPE_PRICE_STARTER/PROFESSIONAL/BUSINESS`. If they're unset, Checkout creates the £19/£29/£49 monthly prices inline.
3. **Webhook:** add an endpoint `https://your-domain/api/stripe/webhook` with these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

   Put the signing secret in `STRIPE_WEBHOOK_SECRET`. To test locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
4. **Billing → Customer portal:** save a configuration (allow cancel and plan switching) so "Manage billing" works.
5. Test end to end with card `4242 4242 4242 4242`: subscribe, check that the plan updates in Settings, then cancel through the portal and check the status changes. The app also confirms the checkout on return, so it works before webhooks do.
6. **Only after the above passes:** switch to the live key and live webhook secret, and set `STRIPE_ALLOW_LIVE=true`.

## Project layout

```
server/            Express API (TypeScript)
  routes/          auth, business+team, sites, visits (photos/pdf/share/send/csv), dashboard, public, billing
  lib/             auth sessions, plan limits, storage & upload checks, PDF renderer, mailer, validation
  schema.sql       PostgreSQL schema (idempotent)
src/               React app
  pages/           Landing, Pricing, Auth, Dashboard, Sites, SiteForm, NewVisit, VisitForm, Reports, ReportView, Settings, PublicReport
  components/      Layout, UI kit, pricing table, report body
scripts/smoke-test.ts
```
