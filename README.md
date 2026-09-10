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
**What it's for:** a quick "is everything okay?" health check of the whole operation — the first thing you see, before you go dig into a specific tab.

**What it covers:**
- Four metric tiles: Total SKUs, Total Items (variants), how many SKUs are currently Low Stock, and units Sold This Week
- A SKU overview table — every SKU with a visual stock bar and status pill, so low/out-of-stock products jump out immediately
- A Revenue & Orders chart (bars = revenue, line = order count), toggleable between Week and Month, to see whether sales are trending up or down
- In Demo mode, a "Want to edit data?" banner nudging you toward Try Demo

It's read-only — there's nothing to add or record here, it only reflects what's already in Products/Stock In/Stock Out.

### Products (`products.html`)
**What it's for:** the master catalog — the source of truth for what products exist, what they cost, what they sell for, and when they need reordering. Every other tab depends on a SKU existing here first: Stock In/Out's SKU dropdowns, Inventory, and Sales Orders' product picker all read from this same list.

**What it covers:**
- An **Add Product** form to register a new SKU: SKU ID, product name, category, unit price, cost price, reorder threshold, which sales channels it's listed on (Tokopedia/Shopee/TikTok Shop/Direct), and optional notes
- A searchable, filterable (by category) table of every existing SKU, showing its channels, unit price, current stock, and status

Adding a SKU here doesn't create any stock — a new product starts at 0 units until you record a Stock In for it.

### Inventory (`inventory.html`)
A richer, read-only catalog view — grid or table layout, with brand/classification filters and low-stock/out-of-stock status filtering. Has its own "Import JSON" feature for pasting arbitrary catalog data to preview (stored in `localStorage`, browser-only, unrelated to Sandbox mode).

### Packing Lists (`packinglists.html`)
**What it's for:** tracking shipments from suppliers that are *on their way* — the "what's expected to arrive, and when" list. This is distinct from Stock In, which is for stock that has *already arrived and been counted*. Packing Lists exists so you have visibility into inbound inventory before it's a confirmed Stock In record.

**What it covers:**
- Metric tiles: how many packing lists are still open (not yet received), total inbound units expected, and total units already received
- A form to build a new packing list: header details (PL number, date, supplier, status — Draft / In Transit / Received / Cancelled, notes) plus line items (pick a SKU, quantity, unit cost) with running totals
- A table of all packing lists with a "Receive" action to mark one as arrived

Right now this whole tab is a **local-only preview** — everything is stored in your browser (`localStorage`), including in Live mode. Clicking "Receive" while signed in shows a toast explaining the real backend endpoint for it doesn't exist yet ("live receive comes next"); it doesn't write to your Google Sheet or touch SKU stock counts.

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
