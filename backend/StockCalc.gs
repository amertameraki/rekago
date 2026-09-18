// ============================================================
// StockCalc.gs — Rekago Backend
// Shared helper: recalculates SKU stock after any transaction.
// Called by StockIn.gs and StockOut.gs — not exposed as an action.
// ============================================================

/**
 * Applies a delta to a SKU's Current Stock and auto-updates SKU Status.
 * delta is positive for Stock In, negative for Stock Out.
 */
function updateSkuStock(skuId, delta) {
  const sheet = getSkusSheet();
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][COL.SKUS.SKU_ID - 1] === skuId) {
      const currentStock  = Number(data[i][COL.SKUS.STOCK - 1])  || 0;
      const reorderThresh = Number(data[i][COL.SKUS.REORDER - 1]) || 0;
      const newStock      = Math.max(0, currentStock + delta);

      sheet.getRange(i + 1, COL.SKUS.STOCK).setValue(newStock);

      // Auto-update SKU status
      let newStatus = 'In Stock';
      if (newStock === 0)                 newStatus = 'Out of Stock';
      else if (newStock <= reorderThresh) newStatus = 'Low Stock';
      sheet.getRange(i + 1, COL.SKUS.STATUS).setValue(newStatus);

      break;
    }
  }
}
