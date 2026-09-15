# AIC Inventory App

Inventory Management + Business Analytics Dashboard.
Google Sheets (operational entry) → Google Apps Script (sync, auth, API) → SQL (analytics) → HTML/Chart.js dashboard.

---

## File tree

```
AIC_Inventory_App/
├── README.md
├── dashboard_live.html        # standalone dashboard running on your real dataset
├── dashboard_logic.js         # its chart/filter logic
├── embedded_data.js           # pre-aggregated real data (demo only)
├── chart.umd.min.js           # Chart.js 4.4.4, vendored
├── sql/
│   ├── schema.sql             # 14 tables + sync_log, PK/FK/constraints
│   ├── indexes.sql            # indexes tuned to the dashboard's query shapes
│   ├── views.sql              # 13 analytics views
│   ├── dashboard_queries.sql  # parameterised filter queries
│   └── seed.sql               # bulk-load instructions + first admin user
└── gas/                       # paste these into Apps Script
    ├── Code.gs                # doGet + api() router
    ├── Config.gs              # Script Properties accessors
    ├── Database.gs            # JDBC adapter + REST fallback + connection tests
    ├── Auth.gs                # sessions + role permissions
    ├── Utils.gs               # validation, IDs, audit, date ranges
    ├── Sync.gs                # Sheets ↔ SQL synchronization
    ├── Dashboard.gs           # getDashboardData() — one call, all charts
    ├── Inventory.gs  Suppliers.gs  Customers.gs
    ├── Purchases.gs  Sales.gs  Receipts.gs  Payments.gs
    ├── Reports.gs    Users.gs
    ├── Index.html             # SPA shell
    ├── Styles.html            # all CSS
    ├── ChartLib.html          # vendored Chart.js
    ├── App.html               # auth, router, generic CRUD table
    ├── App2.html              # Inventory, Receipts, Payments, Reports, Settings
    ├── App3.html              # Purchases & Sales invoice builder
    └── DashboardJS.html       # dashboard charts
```

---

## Setup, step by step

### 1. Google Sheet
Create a sheet with tabs: `Inventory, Products, Categories, Suppliers, Customers, Purchases, Sales, Receipts, Payments, Users, Settings, Locations, Purchase_Items, Sale_Items`, using the column names from your existing dataset. Note the sheet ID from its URL.

### 2. SQL database
Any MySQL 8+/MariaDB, or PostgreSQL with minor type edits. Cloud SQL, RDS, PlanetScale and Railway all work. Run in order:

```bash
mysql -h HOST -u USER -p < sql/schema.sql
mysql -h HOST -u USER -p aic_inventory < sql/indexes.sql
mysql -h HOST -u USER -p aic_inventory < sql/views.sql
```

### 3. First data load
Your dataset has ~40,000 transaction rows. Loading that through Apps Script row-by-row will hit the 6-minute execution limit, so do the **first** load with CSV exports + `LOAD DATA` (see `sql/seed.sql` for the order that respects foreign keys). After that, `Sync.gs` handles ongoing changes fine.

### 4. Apps Script project
Create a new Apps Script project. Add each file from `gas/` with a matching name — `.gs` files as script files, `.html` files as HTML files. **Name them exactly**, since `include()` resolves by filename.

### 5. Script Properties
Project Settings → Script Properties:

| Key | Example | Notes |
|---|---|---|
| `DB_TYPE` | `mysql` | `mysql`, `postgres`, or `api` |
| `DB_HOST` | `10.x.x.x` | |
| `DB_PORT` | `3306` | |
| `DB_NAME` | `aic_inventory` | |
| `DB_USER` | `aic_app` | |
| `DB_PASSWORD` | — | also used as the bearer token in `api` mode |
| `SQL_API_URL` | — | only for `DB_TYPE=api` |
| `SHEET_ID` | — | from step 1 |
| `SESSION_SECRET` | random UUID | |
| `ALLOW_NEGATIVE_INVENTORY` | `false` | `true` lets sales exceed stock |

Credentials live only here — never in source, never in the frontend.

### 6. Whitelist Apps Script's IPs
JDBC connects from Google's servers. Either allow Google's IP ranges on your DB, or use Cloud SQL (which Apps Script connects to natively). If your DB only accepts private-network connections, set `DB_TYPE=api` and put a small authenticated service in front of it — the contract is documented in `Database.gs`.

### 7. Create the first admin
Apps Script has no bcrypt, so `Auth.gs` uses SHA-256. Generate a hash and insert it per `sql/seed.sql`. Change the password after first login.

### 8. Deploy
Deploy → New deployment → Web app. Execute as **Me**; access per your requirements. Authorize when prompted (Sheets, external requests, JDBC).

### 9. Verify
Open the web app, log in, and check Settings — Database and Google Sheets should both read CONNECTED. Then run a manual sync.

---

## Architecture notes

**Balances are derived, not stored.** Receivable = customer opening balance + sales − receipts (`vw_customer_receivables`); payable mirrors it. So recording a receipt is a single INSERT; nothing can drift out of sync because there's no second copy to update.

**One dashboard call.** `getDashboardData(filters)` returns every KPI and chart series in a single response, cached 60s per filter combination.

**Date filters and balances.** Sales/purchases/profit respect the date range. Receivable and payable are as-of-today balances — a "this month" receivable figure would be misleading, since the money owed isn't a property of the month.

**Transactions.** Sales and purchases write header, line items, and inventory movement inside one SQL transaction, so a mid-write failure can't leave stock wrong.

**Sync is idempotent.** Every `syncXToSQL()` upserts by ID and never deletes. Re-running is always safe. Results go to `sync_log` and surface in Settings.

Purchase/Sales *line items* are written by the app, not synced from Sheets — syncing them would double-count inventory, since the app already moved stock when the invoice was created.

---

## Testing checklist

Verified in a headless browser against a mocked backend before delivery:

- [x] Login, session, logout
- [x] Role menus: Admin 11 items, Manager 7, Staff 4, Viewer 2
- [x] Dashboard: 6 KPIs + 9 charts, no console errors
- [x] Filters re-query and re-render
- [x] Inventory: search, status filter, pagination, CSV, add product
- [x] Suppliers/Customers/Users: list, search, add, edit prefill, delete confirm
- [x] Invoice builder: add/remove lines, live totals (5×200 = ₹1,000; +2×100 = ₹1,200)
- [x] Reports: run, render, export
- [x] Settings: connection status, manual sync results

Still to verify **on your infrastructure** (needs a real DB, which I can't reach):

- [ ] JDBC connects and `testDatabaseConnection()` returns connected
- [ ] `syncAllToSQL()` against real sheet volumes
- [ ] Stock-insufficient rejection on a real sale
- [ ] Transaction rollback on a mid-write failure
- [ ] Dashboard query timing on the full dataset

---

## Troubleshooting

**"Failed to establish a database connection"** — IP allowlist is the usual cause. Confirm the DB accepts external connections and Google's ranges are allowed. Otherwise switch to `DB_TYPE=api`.

**Exceeded maximum execution time** — a sync too large for one 6-minute run. Bulk-load the history once (step 3), then sync incrementally.

**Blank page after deploy** — a missing or misnamed HTML file. `include()` needs exact names. Check the Apps Script execution log.

**Dashboard shows zeros** — data didn't reach SQL. Run `SELECT COUNT(*) FROM sales;` directly.

**Stale numbers after entry** — the 60s dashboard cache. Wait, or change a filter to force a fresh key.

**Sync reports failed rows** — read `error_details` in `sync_log`. Usually a foreign key pointing at a missing parent; load categories/suppliers/locations before products.

---

## Security

Credentials in Script Properties only. Every API function calls `requirePermission_()` server-side — hiding a menu item is cosmetic, the server check is what enforces access. All SQL uses parameterised statements. Totals are recomputed server-side from line items, never trusted from the client. Deletes are soft (status → Inactive). Sensitive actions write to `audit_logs`.

Two things to harden before handling anything high-value: replace SHA-256 password hashing with real bcrypt via a small external endpoint, and move sessions from `CacheService` to a `sessions` table if you need them to survive cache eviction.
