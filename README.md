# Rekago — Inventory, rekapped

Rekago is a lightweight inventory management app for a small business (Studio Tools · Amerta Meraki Digital Atelier). It's a static, no-build frontend (plain HTML/CSS/JS, no framework) backed by a Google Apps Script Web App that reads and writes a Google Sheet.

Live site: **rekago.amertameraki.com** (served from the `main` branch via GitHub Pages)

---

## How it's put together

```
Browser (static site)  ──fetch──▶  Google Apps Script Web App  ──▶  Google Sheet
   index.html + tabs                doGet (public) / doPost (auth)     (the real data)
```

- **Frontend**: `index.html` is the app shell — nav, splash screen, onboarding tour, the "Try Demo" modal, and all shared state/logic. Every tab (`dashboard.html`, `products.html`, etc.) is a separate file containing just that page's `<main>` markup, its own `<style>`, and its own `<script>`. `index.html`'s `loadPage(name)` fetches a tab's HTML on first visit, injects it into `#page-frame`, executes its `<script>`, and calls that page's `init_<name>()` function.
- **Backend**: a Google Apps Script project (not in this repo — lives in Apps Script's own editor, mirrored locally at `/Users/amifraise/Mac/Developers/RekaGo/GS & HTML/` for reference). `doGet` serves a couple of public, read-only endpoints; `doPost` handles everything else and requires a **Google Sign-In ID token**, which it verifies server-side before touching the Sheet.
- **Config**: `config.js` holds the Apps Script Web App URL and the Google OAuth Client ID. Both are safe to be public — see the comment at the top of that file for why.

---

## The three modes

The app can be in exactly one of these at any time (`REKAGO.mode`):

| Mode | How you get there | What it can do |
|---|---|---|
| **Demo** | Default, no action needed | Read-only. Shows fixed example data baked into each page (e.g. `DASH_MOCK`, `PRODUCTS_MOCK`). All "Add/Record/Create" buttons are disabled with a note pointing at Try Demo. |
| **Sandbox** | Click **Try Demo** (top right) → enter *any* email, no verification | Fully interactive. Seeded from `SANDBOX_SEED` in `index.html` (a copy of the demo numbers). You can add products, record stock in/out, create sales orders — everything updates in memory and is fully cross-linked (add a product on Products, it shows up in Stock In's dropdown). **Nothing is ever sent to the real backend** — refreshing the page resets you back to Demo. |
| **Live** | Inside the Try Demo modal, a secondary "sign in with a real Google account" option (currently hidden behind the `TRY_LIVE_ENABLED` flag in `index.html`, until `AuthorizedUsers` has real people in it) | Real Google Sign-In. Every write goes to the actual Google Sheet through the Apps Script backend, gated by a verified identity token. |

The point of Sandbox: anyone can click around and genuinely try the product with zero setup, without ever risking real data — because Sandbox writes never call `apiPost` at all, they just mutate `REKAGO.skus` / `REKAGO.items` / etc. in the browser's memory.

`hasLiveData()` (mode is `'live'` or `'sandbox'`) decides whether a page reads from the shared `REKAGO.*` arrays or its own local demo-mode mock data. `requireEditable()` is the gate every "submit" button checks before doing anything.

---

## The tabs, one by one

### Dashboard (`dashboard.html`)
The landing page. Four metric tiles (Total SKUs, Total Items, Low Stock count, Sold This Week), a SKU overview table with a stock bar per row, and a Revenue & Orders chart (Chart.js) toggleable between Week/Month. In Demo mode, shows the "Want to edit data?" banner prompting Try Demo.

### Products (`products.html`)
The SKU catalog. An "Add Product" form (SKU ID, name, category, unit/cost price, reorder threshold, sales channels, notes) and a searchable/filterable table of existing SKUs. Adding a product here is what makes it show up everywhere else (Stock In/Out dropdowns, Inventory, Sales Orders' product picker).

### Inventory (`inventory.html`)
A richer, read-only catalog view — grid or table layout, with brand/classification filters and low-stock/out-of-stock status filtering. Has its own "Import JSON" feature for pasting arbitrary catalog data to preview (stored in `localStorage`, browser-only, unrelated to Sandbox mode).

### Packing Lists (`packinglists.html`)
Tracks inbound shipments from suppliers: build a packing list from line items (SKU, qty, unit cost), then mark it "Received." This page is currently **always** local-only (stored in `localStorage`) — even in Live mode, the "Receive" action just shows a toast that the backend endpoint for it doesn't exist yet.

### Stock In (`stockin.html`)
Records inbound stock (restock, initial stock, or a return). Picking a SKU populates the Item dropdown. Submitting increases that SKU's `Current Stock` and recalculates its status (In Stock / Low Stock / Out of Stock) against its reorder threshold — both the real backend (`StockCalc.gs`) and Sandbox mode (`applySandboxStockDelta()` in `index.html`) do this exact same calculation.

### Stock Out (`stockout.html`)
The mirror of Stock In — records outbound stock (sold, marketing sample, damaged, or a return inbound, which does *not* deduct stock). Same stock-recalculation logic, just subtracting instead of adding.

### Sales Orders (`salesorders.html`)
Create a sales order: header fields (SO number, date, channel, customer ref, status) plus a line-item builder that checks each product's available stock as you add lines and auto-fills the order's total qty/revenue. Sales Orders don't themselves touch SKU stock — that only happens via Stock Out.

---

## How the tabs connect

- **`REKAGO`** (declared in `index.html`) is the one shared state object every page reads and writes: `mode`, `email`, `idToken`, and the five data arrays (`skus`, `items`, `stockIn`, `stockOut`, `salesOrders`).
- In **Live** mode, those arrays are populated once after sign-in by `loadAllData()`, which calls the backend for each dataset.
- In **Sandbox** mode, they're seeded once from `SANDBOX_SEED` when you click Start, then mutated directly by each page's submit handler.
- In **Demo** mode, they stay empty — every page falls back to its own hardcoded mock constant instead.
- Because every page checks the *same* `REKAGO.skus` (via `hasLiveData()`), anything added on one tab is immediately visible on every other tab in the same session — no page reload needed.
- Shared helpers used by every page live in `index.html`: `escapeHtml()` (XSS-safe rendering), `formatRp()`, `channelPill()`/`statusPill()`, `showToast()`, and `apiGet()`/`apiPost()` (the only two functions that ever talk to the real backend).

---

## Frontend ↔ backend connection

- `apiGet(action)` → `GET {gsUrl}?action=...` — **no auth**, used only for data that's safe to be public (`getProducts` without Cost Price, `getItems`, `getSettings`, `ping`).
- `apiPost(action, payload)` → `POST {gsUrl}` with `{ action, idToken, ...payload }` — **every** action here requires a verified Google Sign-In token; the backend checks it against `AuthorizedUsers` before doing anything, including reads that return sensitive data (e.g. the authenticated `getProducts` includes Cost Price).
- The backend never trusts a client-supplied email — it always derives the caller's identity from Google's own verification of the ID token (`verifiedEmailFromIdToken()` in `Auth.gs`).
- A `401`/`403` response from any `apiPost` call automatically drops the frontend back to Demo mode with a "session expired" toast.

---

## Deploying changes

- **Frontend**: this repo. Work happens on the `preview` branch; GitHub Pages only serves `main`, so nothing goes live until `preview` is merged into `main` and pushed.
- **Backend**: not in this repo. Edit the files under `/Users/amifraise/Mac/Developers/RekaGo/GS & HTML/` locally, paste the changed ones into the Apps Script editor, then **Deploy → Manage deployments → Edit → New version → Deploy** — saving alone does not update the live endpoint.

---

## File reference

| File | Purpose |
|---|---|
| `index.html` | App shell: nav, splash, tour, Try Demo modal, shared state/helpers, `loadPage()` router |
| `config.js` | Apps Script URL + Google OAuth Client ID (committed, not secret — see file comment) |
| `dashboard.html`, `products.html`, `inventory.html`, `packinglists.html`, `stockin.html`, `stockout.html`, `salesorders.html` | One file per tab |
| `CNAME` | Custom domain for GitHub Pages |
| `LICENSE` | MIT |
