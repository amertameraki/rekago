// ============================================================
// StockOut.gs — Rekago Backend
// Handles all Stock Out transactions.
// ============================================================

// ── READ ─────────────────────────────────────────────────

function getStockOut() {
  return sheetToObjects(SHEET.STOCK_OUT);
}

// ── WRITE ────────────────────────────────────────────────

/**
 * Records a Stock Out transaction and updates SKU stock count.
 * Return Inbound type does NOT deduct stock — it goes to Stock In instead.
 */
function addStockOut(body, email) {
  const {
    date, refId, skuId, itemId, productName,
    category, channel, orderRef, qty, unitPrice, type, notes,
  } = body;

  if (!skuId)  return err('skuId is required.', 400);
  if (!itemId) return err('itemId is required.', 400);

  // Validate server-side — the client's own qty>=1 check is UX only and
  // can be bypassed by calling this endpoint directly. A negative qty
  // here would silently *increase* stock while logged as "Sold".
  const qtyNum = Number(qty);
  if (!Number.isFinite(qtyNum) || qtyNum < 1) {
    return err('qty must be a positive number.', 400);
  }
  const unitPriceNum = Number(unitPrice) || 0;
  if (unitPriceNum < 0) return err('unitPrice cannot be negative.', 400);
  const totalRevenue = qtyNum * unitPriceNum;

  getStockOutSheet().appendRow([
    date       || todayDate(),
    refId      || '',
    skuId,
    itemId,
    productName || '',
    category    || '',
    channel     || '',
    orderRef    || '',
    qtyNum,
    unitPriceNum,
    totalRevenue,
    type        || 'Sold',
    notes       || '',
    email,
  ]);

  // Return Inbound does not deduct — caller should log a Stock In instead
  if (type !== 'Return Inbound') {
    updateSkuStock(skuId, -qtyNum);
  }

  logActivity(
    'CREATE_STOCK_OUT',
    'Stock Out: ' + itemId + ' -' + qtyNum + ' via ' + (channel || 'N/A'),
    refId || skuId,
    email
  );

  return ok({ message: 'Stock Out recorded.' });
}
