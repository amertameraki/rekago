# Public Sandbox Inventory Ledger

## Purpose

The Inventory Ledger is the read-only history behind the public Sandbox's
physical stock. It gives a maintainer or visitor one place to trace why a SKU's
quantity changed without introducing production accounting or audit features.

The ledger is derived at render time from shared browser-session state. It does
not store a second editable copy of a movement.

## Sources

Each internal `REKAGO.stockIn` line produces one positive Inbound movement. An
Inbound reference that matches a received public Purchase Order is labelled
**Purchase Order Receipt** and traces to Purchase Orders. Other inbound
references trace to Inbound. References must not be reused across unrelated
source transactions; the
seeded Initial Stock row therefore uses `OPEN-2026-001`, not a Purchase Order
number.

Each `REKAGO.stockOut` line produces one negative ledger movement and traces to
Outbound. Multiple lines may share the same Outbound or Purchase Order reference;
each line remains visible because it changes one SKU/Item quantity.

The public ledger contains no separate Sales Order, committed-stock, warehouse,
costing, or marketplace synchronization logic. Those remain private commercial
capabilities.

## Row contract

Every derived row contains:

| Field | Meaning |
|---|---|
| Date | Movement date recorded by its source workflow |
| Reference | Purchase Order, Inbound, or Outbound reference |
| Source | `Purchase Order Receipt`, `Inbound`, or `Outbound` |
| SKU / Item | The affected product and item identifiers |
| Movement Type | Source movement type such as Restock, Sale, or Consignment Transfer |
| Change | Positive quantity for inbound; negative quantity for outbound |
| Balance | That SKU's physical balance immediately after the movement |
| Trace | Navigation back to the source workflow |

All displayed values are escaped before HTML rendering.

## Opening balances and reconciliation

`SANDBOX_SEED.openingStock` records the physical stock held before the dated
sample movements. The seeded values are:

| SKU | Opening | Recorded net movement | Current physical |
|---|---:|---:|---:|
| BLM-001 | 30 | +54 | 84 |
| BLM-002 | 38 | +18 | 56 |
| BLM-003 | 12 | -4 | 8 |

Running balances begin at this fixed opening baseline. They are not calculated
backward from current stock. This distinction matters: if code changes physical
stock without recording an Inbound or Outbound line, the ledger shows a balance
mismatch instead of silently hiding the missing movement.

For every SKU, this invariant must hold:

```text
opening stock + total Inbound - total Outbound = current physical stock
```

Purchase Order receipt satisfies the invariant through its internal Stock In
rows; those rows must not be duplicated as a second Purchase Order-only movement.

## Ordering

Rows are calculated in ascending date order and displayed newest first. On the
same date, inbound rows are applied before outbound rows. Stable source order is
used for lines sharing the same date and workflow. The Sandbox does not claim
timestamp-level sequencing for sample records that contain only a date.

## Filters and metrics

The ledger supports free-text search across reference, source, SKU, Item, and
movement type, plus SKU and direction filters. Units In and Units Out reflect
the visible filtered rows. Current Physical always reflects all current Sandbox
SKUs so it can be compared with Products, Inventory, and Dashboard.

## Maintainer checks

Before approving a change:

1. Confirm the seeded six movement lines reconcile to BLM-001 `84`, BLM-002
   `56`, and BLM-003 `8`.
2. Add manual Inbound and verify one positive ledger row and the new balance.
3. Receive an open Purchase Order and verify one row per order line, with
   source `Purchase Order Receipt` and no duplicate movement.
4. Record a multi-line Outbound and verify one negative row per line.
5. Confirm the latest ledger balance equals current physical stock for every
   SKU.
6. Test search, combined filters, clear filters, and each source link.
7. Confirm Reset Sandbox restores the opening balances and all movement seeds.
8. Confirm browser logs contain no production backend or identity request.
