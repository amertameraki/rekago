# Public Sandbox Outbound Transactions

## Purpose

The public Rekago Sandbox uses an inventory-first outbound workflow. It does
not maintain a separate Sales Order lifecycle. An outbound transaction records
physical inventory leaving for a sale, consignment transfer, sample, damage,
internal use, supplier return, or outward adjustment.

## Relationship model

One Rekago outbound number may contain several SKU/Item lines. Each line may
optionally retain its own marketplace channel and external order number.

```text
OUT-2026-0003
  ├─ Tokopedia / TKP-501 / SKU A / Qty 2
  ├─ Shopee    / SHP-882 / SKU B / Qty 1
  └─ No order             / SKU C / Qty 4
```

The outbound number identifies the physical movement batch. External order
numbers identify the source marketplace demand; they are optional references,
not Rekago Sales Orders.

## Sandbox data shape

`REKAGO.stockOut` remains a flat array so Dashboard totals and future inventory
ledger views can consume it directly. Lines belonging to one transaction share
the same `Outbound Number`, `Reference ID`, date, movement type, destination,
and notes.

## Integrity rules

- Outbound numbers are generated as `OUT-YYYY-NNNN` and cannot be duplicated.
- Every line requires a valid SKU, matching Item/Variant, and positive whole
  quantity.
- Channel, external order, destination, notes, and unit value are optional.
- Several lines may reference different channels or external orders.
- The total drafted quantity for an SKU cannot exceed its physical stock.
- The full transaction is revalidated before any line or stock change is
  recorded.
- If one line is invalid or understocked, nothing in the transaction is
  recorded.
- Stock is deducted once per SKU using the aggregate quantity across all lines.
- Physical stock cannot become negative.
- Refreshing the public Sandbox restores the fixed sample dataset.

## Scope boundary

Marketplace imports, order status, committed stock, partial fulfilment, returns
against an original order, and server-side concurrency controls belong to the
optional private Sales Order/Fulfilment module. A consignment transfer records
stock leaving the current location; it must not be treated as confirmed sales
revenue without a separate sell-through record in a commercial implementation.
