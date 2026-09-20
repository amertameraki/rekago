# Rekago Packing Lists — Increment 0 Contract

Status: proposed contract for review. No runtime behavior depends on this document yet.

## Scope of the first implementation stages

The first packing-list release will support:

1. Authenticated listing of packing lists.
2. Authenticated creation of a packing list with one or more item lines.
3. Authenticated viewing of a packing list and its lines.
4. Full-list receiving and cancellation in a later increment.

Partial receiving, editing an existing packing list, supplier management, attachments, and automatic purchase-order generation are outside this initial scope.

## Design decisions

- Packing-list reads and writes are private authenticated actions.
- A packing-list line identifies both an SKU and an Item. Rekago's existing Stock In action requires both values, so this is necessary for receiving to work safely later.
- New packing lists may start only as `Draft` or `In Transit`.
- `Received` can be reached only through the future receive action so stock cannot be bypassed.
- `Cancelled` can be reached only through the future cancel action.
- Receiving is all-or-nothing in the initial release.
- Packing-list numbers are unique and cannot be reused.
- Quantities must be positive whole numbers.
- Unit cost may be zero but cannot be negative.
- Totals, timestamps, and authenticated user fields are calculated by the backend, never trusted from the browser.

## Status transitions

```text
Draft ───────→ In Transit ───────→ Received
  │                 │
  └────→ Cancelled  └────→ Cancelled
```

`Received` and `Cancelled` are terminal states.

## Google Sheet structure

### Sheet: Packing Lists

| Column | Type | Source |
|---|---|---|
| PL Number | Text, unique | User input |
| Date | Date | User input or current date |
| Supplier | Text | User input |
| Status | Draft / In Transit / Received / Cancelled | Backend controlled |
| Notes | Text | User input |
| Total Lines | Number | Backend calculated |
| Total Qty | Number | Backend calculated |
| Total Cost (IDR) | Number | Backend calculated |
| Created By | Email | Verified Google identity |
| Created At | ISO timestamp | Backend generated |
| Received By | Email | Future receive action |
| Received At | ISO timestamp | Future receive action |
| Cancelled By | Email | Future cancel action |
| Cancelled At | ISO timestamp | Future cancel action |

### Sheet: PL Line Items

| Column | Type | Source |
|---|---|---|
| PL Number | Text | Parent packing list |
| SKU ID | Text | Selected product |
| Product Name | Text | Looked up by backend |
| Qty | Positive whole number | User input |
| Unit Cost | Non-negative number | User input |
| Total Cost | Number | Backend calculated |
| Created By | Email | Verified Google identity |
| Created At | ISO timestamp | Backend generated |
| Line Number | Positive integer | Backend generated; appended for the new workflow |
| Item ID | Text | Selected variant/item; appended for the new workflow |
| Item Name | Text | Looked up by backend; appended for the new workflow |

The first eight columns above are the existing sheet structure and remain in
their current order. The backend appends the final three headers only when a
packing list is first created through the new workflow. Existing rows are not
rewritten or deleted. Historical rows without an Item ID remain readable but
must be matched to an Item before a future receive-to-stock action can process
them safely.

If an existing line group has no corresponding row in `Packing Lists`, the API
returns a non-destructive recovered view of that group. Its date and creator are
inferred from `Created At` and `Created By`, totals are recalculated from its
lines, supplier remains blank, and status is `Draft`. The packing-list number is
also reserved so a new list cannot accidentally reuse it.

## Authenticated API contract

All actions use the existing POST request format and include a Google `idToken`.

### `getPackingLists`

Request:

```json
{
  "action": "getPackingLists",
  "idToken": "<google-id-token>"
}
```

Successful response:

```json
{
  "ok": true,
  "data": [
    {
      "number": "PL-2026-005",
      "date": "2026-09-18",
      "supplier": "Supplier Name",
      "status": "Draft",
      "notes": "",
      "totalLines": 1,
      "totalQty": 20,
      "totalCost": 440000,
      "createdBy": "user@example.com",
      "createdAt": "2026-09-18T01:00:00.000Z",
      "receivedBy": "",
      "receivedAt": "",
      "cancelledBy": "",
      "cancelledAt": "",
      "lines": [
        {
          "lineNumber": 1,
          "skuId": "BLM-001",
          "itemId": "BLM-001-NAT",
          "productName": "Rattan Placemat",
          "itemName": "Rattan Placemat — Natural",
          "qty": 20,
          "unitCost": 22000,
          "totalCost": 440000
        }
      ]
    }
  ]
}
```

### `createPackingList`

Request:

```json
{
  "action": "createPackingList",
  "idToken": "<google-id-token>",
  "number": "PL-2026-005",
  "date": "2026-09-18",
  "supplier": "Supplier Name",
  "status": "Draft",
  "notes": "",
  "lines": [
    {
      "skuId": "BLM-001",
      "itemId": "BLM-001-NAT",
      "qty": 20,
      "unitCost": 22000
    }
  ]
}
```

Successful response:

```json
{
  "ok": true,
  "message": "Packing List created.",
  "number": "PL-2026-005"
}
```

The backend looks up product and item names from the existing sheets. The client does not submit trusted names or calculated totals.

### `receivePackingList`

Request:

```json
{
  "action": "receivePackingList",
  "idToken": "<google-id-token>",
  "number": "PL-2026-005"
}
```

Successful response:

```json
{
  "ok": true,
  "message": "Packing List received.",
  "number": "PL-2026-005",
  "totalQty": 20
}
```

Receiving writes one Stock In row per packing-list line, aggregates quantities
per SKU before updating stock, and then marks the packing-list header as
`Received` with the verified user and timestamp. Validation completes before
any stock mutation. The operation is protected by a script lock and rolls back
new Stock In values, SKU stock/status, and header status if a write fails.

Recovered legacy groups cannot be received until they have a real header and
every line is matched to a valid Item ID. A packing-list number already present
in Stock In is rejected to prevent a retry from double-counting inventory.

### `cancelPackingList`

Request:

```json
{
  "action": "cancelPackingList",
  "idToken": "<google-id-token>",
  "number": "PL-2026-005"
}
```

Cancellation is allowed only from `Draft` or `In Transit`. It updates the
header to `Cancelled` with the verified user and timestamp and does not create
Stock In rows or change SKU stock. `Received`, already-cancelled, and recovered
headerless groups are rejected. Header writes are restored if a write fails.

## Validation and expected errors

| Condition | Expected code |
|---|---:|
| Missing or expired Google identity token | 401 |
| Authenticated email is not authorized | 403 |
| Missing required field or invalid value | 400 |
| SKU or Item does not exist, or Item does not belong to SKU | 400 |
| Packing-list number already exists | 409 |
| Backend lock cannot be acquired | 503 |
| Packing list already received, cancelled, or already represented in Stock In | 409 |
| Missing/mismatched Item ID on a receiving line | 409 |
| Packing list already received/cancelled or recovered without a header | 409 |

## Safe rollout

- Add backend sheets and endpoints before connecting the frontend.
- Keep the current local preview behavior available while live packing lists are incomplete.
- Gate the live packing-list path behind a disabled-by-default frontend flag.
- Make every backend addition backward-compatible with the currently deployed frontend.
- Enable live packing lists only after authenticated staging tests pass.

## Acceptance criteria for this contract increment

- The required header and line fields are agreed.
- Item selection is accepted as part of every packing-list line.
- Status transitions are agreed.
- Initial receiving is confirmed as full-list only.
- The proposed API names and response shape are accepted.
- No frontend or backend behavior has changed.
