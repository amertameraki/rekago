# Rekago Maintenance and Release Checklist

Use this checklist when revising Rekago. It is intentionally short enough to
use during every change. Feature contracts contain the detailed business rules;
this document defines the safe editing and release process.

## Public Sandbox release gate

The public runtime is browser-only. Before every public Preview deployment:

- [ ] The app opens directly in editable Sandbox mode without sign-in.
- [ ] Refreshing restores the fixed sample data.
- [ ] Add Product, Stock In, Stock Out, Sales Order, and Packing List actions
      work within the current session.
- [ ] Browser network logs contain no request to Google Apps Script, Google
      Identity, a production API, or a customer data source.
- [ ] The frontend contains no deployed endpoint, OAuth client ID, identity
      token, credential, or business data.
- [ ] `connect-src` remains restricted to `'self'`.
- [ ] The commercial CTA opens the intended external contact page.
- [ ] The complete diff is reviewed, then pushed to `preview` only.

The authenticated backend and Packing List checks below are retained for the
private implementation. They are not deployment steps for the public Sandbox.

## Before editing

- Read the affected feature contract and the relevant frontend and backend
  modules.
- Confirm the current branch and keep development work on `preview`.
- Inspect the working tree and preserve unrelated user changes.
- Identify the affected Sheet tabs, headers, API actions, feature flags, and
  deployment environments.
- Define the expected behavior, failure behavior, and rollback behavior before
  changing a multi-sheet operation.

## Documentation rules

- Explain why a rule exists and what invariant must remain true; do not comment
  every obvious statement.
- Keep Sheet names, required headers, API requests/responses, state transitions,
  and error codes in the feature contract.
- Update documentation in the same change whenever behavior or a data contract
  changes.
- Record intentional limitations and non-goals so future maintainers do not
  mistake them for omissions.

## Private reference: Packing Lists and receive-to-stock regression checks

Use unique PL numbers and test SKUs in the Preview Sheet. Record starting stock
before tests so every stock delta can be verified.

### Read and create

- [ ] An authorized user can load Packing Lists and their nested lines.
- [ ] Draft and In Transit lists can be created with multiple lines.
- [ ] Product name, Item name, totals, creator, and timestamps come from the
      backend rather than trusted browser values.
- [ ] Duplicate PL numbers are rejected, including numbers present only in
      retained legacy line groups.
- [ ] Invalid quantities, costs, SKUs, Items, and SKU/Item combinations are
      rejected without writing partial data.
- [ ] Existing `PL Line Items` columns and historical rows remain unchanged;
      missing workflow columns are appended only at the right.

### Receive

- [ ] A Draft list can be fully received.
- [ ] An In Transit list can be fully received.
- [ ] Receiving creates exactly one Stock In row per Packing List line.
- [ ] Every Stock In row uses the PL number as `Reference ID` and contains the
      correct SKU, Item, quantity, cost, supplier, and verified user.
- [ ] If several lines use one SKU, SKU stock increases by their combined
      quantity exactly once and stock status is recalculated.
- [ ] The header becomes Received with `Received By` and `Received At` only
      after the stock writes succeed.
- [ ] A second receive attempt is rejected and does not change stock.
- [ ] Cancelled lists, missing headers, missing Item IDs, and mismatched Items
      cannot be received.
- [ ] A forced or simulated write failure restores Stock In, SKU stock/status,
      and receipt fields to their prior values.

### Cancel

- [ ] Draft and In Transit lists can be cancelled.
- [ ] Cancellation records the verified user and timestamp.
- [ ] Cancellation does not add Stock In rows or change SKU stock.
- [ ] Received, already-cancelled, and recovered headerless lists are rejected.

### Authorization and interface

- [ ] Missing, expired, or unauthorized identity tokens are rejected.
- [ ] Demo and Sandbox remain browser-only and do not write to the real Sheet.
- [ ] Live-mode loading, create, receive, and cancel states provide clear
      success and error feedback.
- [ ] Moving quickly between pages does not initialize a stale page or duplicate
      an action.

## Private reference: Apps Script Preview deployment

- [ ] Review the complete diff; confirm no credentials or Sheet data are
      committed.
- [ ] Deploy changed `.gs` files as a new version of the Preview Apps Script Web
      App. Saving is not a deployment.
- [ ] Verify backend `ping`, Google sign-in, and the affected authenticated
      actions.
- [ ] Push the frontend to `preview` only; confirm the Preview deployment uses
      the intended backend URL and OAuth client ID.
- [ ] Run the affected feature checklist in the Preview environment.
- [ ] Record the tested Git commit, Apps Script deployment version, test date,
      tester, and any known limitations.

Suggested deployment record:

```text
Date:
Environment: Preview / Production
Frontend commit:
Apps Script deployment version:
Sheet used:
Tester:
Result:
Known limitations:
```

## Private reference: Production promotion

- [ ] The user has approved the Preview result.
- [ ] The exact frontend commit and backend version passed Preview QA together.
- [ ] Production configuration points to the Production backend and authorized
      data source.
- [ ] A previous known-good frontend commit and Apps Script version are noted
      before promotion.
- [ ] Run a small production smoke test after promotion without altering
      unrelated business data.

## Rollback

If a regression is found, stop further writes through the affected feature.
Restore the previous known-good Apps Script deployment and the matching
frontend release or disable the dependent frontend flag. Verify Sheet data for
partial operations before retrying. Do not delete or rewrite historical rows
until the affected records and expected recovery are explicitly identified.

## Testing automation gap

The repository does not yet contain a committed automated test suite. Until it
does, the checked items and deployment record are the evidence for a release.
When tests are added, prioritize backend Sheet mocks for create/receive/cancel,
duplicate and rollback cases, plus browser tests for Live-mode Packing List
navigation and actions. Document one standard command for running the complete
suite.
