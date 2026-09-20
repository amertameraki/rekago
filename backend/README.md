# Rekago Apps Script Backend

This directory is the version-controlled source for the Google Apps Script
backend used by Rekago. Google Apps Script does not deploy these files
automatically, so the deployed Apps Script project and this directory must be
kept in sync deliberately.

## Request lifecycle

```text
Rekago frontend
      │ GET (public reads) or POST (private actions)
      ▼
Router.gs
      │ private POST identity check
      ▼
Auth.gs
      │ verified authorized email
      ▼
Feature module (for example PackingLists.gs)
      │
      ▼
Google Sheet + ActivityLog.gs
```

`Router.gs` is the only file that defines `doGet()` and `doPost()`. Private
actions must use `doPost()`, call `requireAuth()`, and use the verified email
returned by the backend. Never trust an email, calculated total, timestamp, or
status supplied by the browser.

## File map

| File | Responsibility |
|---|---|
| `Config.gs` | Sheet names, column indexes, accessors, response helpers, dates |
| `Router.gs` | Public/private API entry points and action routing |
| `Auth.gs` | Google token verification and authorized-user checks |
| `Products.gs` | Product and Item reads/writes |
| `StockIn.gs` / `StockOut.gs` | Inventory movement records |
| `StockCalc.gs` | SKU stock and status calculation |
| `SalesOrders.gs` | Sales Order operations |
| `PackingLists.gs` | Packing List read/create/receive/cancel operations |
| `ItemStatus.gs` | Item status changes and history |
| `ActivityLog.gs` | Auditable user activity records |

Feature-specific Packing List rules and Sheet schemas are documented in
[`../docs/packing-lists-contract.md`](../docs/packing-lists-contract.md).

## Sheet dependency rules

- Treat Sheet tab names and header names as an external data contract.
- Do not rename, reorder, or delete an existing column without a documented
  migration and rollback plan.
- Prefer header lookup where a Sheet may contain historical layouts.
- Preserve existing rows. Add compatibility behavior before rewriting data.
- Validate all input and referenced records before beginning a multi-sheet
  mutation.
- Use a script lock for operations that must not run concurrently.
- For multi-sheet operations, snapshot the values required to restore the
  previous state if a later write fails.

## Deployment model

Changes in this directory are not deployed automatically by the frontend host.
After a backend increment is reviewed and tested, the changed `.gs` files must
be copied into the Google Apps Script project and deployed as a new Web App
version.

Backend changes should be additive and remain compatible with the currently
deployed frontend. New frontend behavior must remain disabled until its backend
deployment has passed staging tests.

### Preview deployment

1. Review the Git diff and identify every changed `.gs` file.
2. Copy those files into the Preview Apps Script project using the same file
   names.
3. In Apps Script, use **Deploy → Manage deployments → Edit → New version →
   Deploy**. Saving files is not sufficient.
4. Confirm `ping`, sign-in, and the affected authenticated actions against the
   Preview Sheet.
5. Push dependent frontend behavior to the `preview` branch only after the
   backend checks pass.
6. Complete the relevant section of
   [`../docs/maintenance-checklist.md`](../docs/maintenance-checklist.md).

### Production promotion and rollback

- Promote only the Git commit and Apps Script deployment version that passed
  Preview QA together.
- Record both version identifiers in the release notes or deployment record.
- If a backend regression occurs, select the previous known-good Apps Script
  deployment version. If the frontend depends on the regressed action, disable
  its feature flag or restore the matching known-good frontend release.

## Adding or changing an action

1. Define the business contract, validation, allowed states, and error codes.
2. Implement the operation in the appropriate feature module.
3. Register the action in `Router.gs`; use private POST routing for sensitive
   reads and every write.
4. Add or update frontend integration behind a feature flag when deployment
   order matters.
5. Test authorization failure, invalid input, the successful path, duplicate
   submission, and rollback behavior where multiple Sheets are changed.
6. Update the relevant contract and maintenance checklist.

## Secrets and private data

Do not commit credentials, private keys, access tokens, or spreadsheet data to
this directory.

The OAuth client ID and Apps Script Web App URL identify public endpoints and
are not authentication secrets. Authorization must continue to be enforced by
server-side Google ID-token verification and the `AuthorizedUsers` Sheet.
