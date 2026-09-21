# Rekago Public Sandbox

Rekago is browser-based inventory management software for small product
businesses. This public repository contains the demonstration edition: an
editable Sandbox that uses dummy data and never connects to a business
database or Google Sheet.

Public Sandbox: **rekago-demo.amertameraki.com**

## Safety boundary

The public Sandbox has one operating mode:

- It starts immediately without sign-in.
- All changes exist only in the current browser session.
- Refreshing the page restores the fixed sample data.
- The global **Reset Sandbox** control confirms, then restores every sample
  dataset and unfinished draft together.
- There is no Apps Script URL, OAuth client ID, identity token, or production
  configuration in the frontend.
- The browser Content Security Policy permits network requests only to the
  same origin, apart from static font and chart assets.

The `backend/` directory is retained as reference source for maintainers. It is
not used or deployed by the public Sandbox. Its unauthenticated `doGet` route
exposes only `ping`; all business-data operations remain authenticated POST
actions. Replace placeholder configuration only inside a private deployment.

## Architecture

`index.html` is the static app shell and shared in-memory data store. Each tab
is a separate HTML fragment loaded into `#page-frame`:

| File | Purpose |
|---|---|
| `dashboard.html` | Operational summary and sample charts |
| `products.html` | Product catalog and new-SKU form |
| `inventory.html` | Inventory grid/table and session-only JSON preview |
| `packinglists.html` | Browser-only simplified Purchase Order workflow |
| `stockin.html` | Session-only inbound stock movements |
| `stockout.html` | Multi-line outbound transactions with optional channel and order references |
| `ledger.html` | Read-only unified movement history with per-SKU running balances |

Shared state is held in `REKAGO` inside `index.html`. Product and stock changes
are cross-linked during the session. Purchase Order receipt creates matching
Inbound rows and increases physical stock exactly once. The Inventory Ledger
combines Inbound and Outbound lines, links them to their source workflow, and
reconciles their running balances to current physical stock. No browser action
calls `backend/`.

## Run locally

Serve the directory over HTTP so page fragments can be fetched:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Contribution and deployment

Development is reviewed and tested on the `preview` branch before promotion to
`main`. Confirm that the Sandbox makes no requests to Google Apps Script or
Google Identity before every public release.

The public edition is MIT-licensed. Commercial implementations, private
configuration, customer data, production integrations, and advanced modules
are maintained separately and are not part of this public runtime.

See [`docs/maintenance-checklist.md`](docs/maintenance-checklist.md) for the
release checks and [`docs/packing-lists-contract.md`](docs/packing-lists-contract.md)
for the reference receive-to-stock contract. The public inventory-first model
is documented in [`docs/outbound-transactions.md`](docs/outbound-transactions.md),
and the ledger rules are documented in
[`docs/inventory-ledger.md`](docs/inventory-ledger.md).
