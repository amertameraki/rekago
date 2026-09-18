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

### Sheet: Packing List Lines

| Column | Type | Source |
|---|---|---|
| PL Number | Text | Parent packing list |
| Line Number | Positive integer | Backend generated |
| SKU ID | Text | Selected product |
| Item ID | Text | Selected variant/item |
| Product Name | Text | Looked up by backend |
| Item Name | Text | Looked up by backend |
| Qty | Positive whole number | User input |
| Unit Cost (IDR) | Non-negative number | User input |
| Total Cost (IDR) | Number | Backend calculated |

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

## Validation and expected errors

| Condition | Expected code |
|---|---:|
| Missing or expired Google identity token | 401 |
| Authenticated email is not authorized | 403 |
| Missing required field or invalid value | 400 |
| SKU or Item does not exist, or Item does not belong to SKU | 400 |
| Packing-list number already exists | 409 |
| Backend lock cannot be acquired | 503 |

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
