// ============================================================
// StockIn.gs — Rekago Backend
// Handles all Stock In transactions.
// ============================================================

// ── READ ─────────────────────────────────────────────────

function getStockIn() {
  return sheetToObjects(SHEET.STOCK_IN);
}

// ── WRITE ────────────────────────────────────────────────

/**
 * Records a Stock In transaction and updates SKU stock count.
 */
function addStockIn(body, email) {
  const {
    date, refId, skuId, itemId, productName,
    category, supplier, qty, unitCost, type, notes,
  } = body;

  if (!skuId)  return err('skuId is required.', 400);
  if (!itemId) return err('itemId is required.', 400);

  // Validate server-side — the client's own qty>=1 check is UX only and
  // can be bypassed by calling this endpoint directly. A negative qty
  // here would silently *decrease* stock while logged as a "Restock".
  const qtyNum = Number(qty);
  if (!Number.isFinite(qtyNum) || qtyNum < 1) {
    return err('qty must be a positive number.', 400);
  }
  const unitCostNum = Number(unitCost) || 0;
  if (unitCostNum < 0) return err('unitCost cannot be negative.', 400);
  const totalCost = qtyNum * unitCostNum;

  getStockInSheet().appendRow([
    date       || todayDate(),
    refId      || '',
    skuId,
    itemId,
    productName || '',
    category    || '',
    supplier    || '',
    qtyNum,
    unitCostNum,
    totalCost,
    type        || 'Restock',
    notes       || '',
    email,
  ]);

  // Update SKU stock level
  updateSkuStock(skuId, qtyNum);

  logActivity(
    'CREATE_STOCK_IN',
    'Stock In: ' + itemId + ' +' + qtyNum + ' units',
    refId || skuId,
    email
  );

  return ok({ message: 'Stock In recorded.' });
}
