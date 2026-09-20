// ============================================================
// Products.gs — Rekago Backend
// Handles SKUs and Items: read and add.
// ============================================================

// ── READ ─────────────────────────────────────────────────

// Full product data, including Cost Price — margin/COGS data that must
// never be served to an unauthenticated caller. Only reachable via doPost
// after Google Sign-In has been verified.
function getProducts() {
  return sheetToObjects(SHEET.SKUS);
}

function getItems() {
  return sheetToObjects(SHEET.ITEMS);
}

function getSettings() {
  const sheet = getSettingsSheet();
  const data  = sheet.getDataRange().getValues();
  if (data.length < 2) return {};

  const headers = data[0];
  const result  = {};
  headers.forEach((h, colIdx) => {
    if (!h) return;
    result[h] = data.slice(1)
      .map(row => row[colIdx])
      .filter(v => v && !v.toString().startsWith('←'));
  });
  return result;
}

// ── WRITE ────────────────────────────────────────────────

/**
 * Adds a new SKU row to the SKUs sheet.
 * Validates required fields and checks for duplicate SKU ID.
 */
function addProduct(body, email) {
  const { skuId, skuName, category, channels, unitPrice, costPrice, reorderThreshold, notes } = body;

  if (!skuId)   return err('skuId is required.', 400);
  if (!skuName) return err('skuName is required.', 400);

  // Lock around the check-then-append so two near-simultaneous requests
  // for the same skuId can't both pass the duplicate check.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return err('Server is busy, please try again.', 503);
  try {
    const existing = getProducts().map(r => r['SKU ID']);
    if (existing.includes(skuId)) {
      return err('SKU ID already exists: ' + skuId, 409);
    }

    getSkusSheet().appendRow([
      skuId,
      skuName,
      category         || '',
      Array.isArray(channels) ? channels.join(', ') : (channels || ''),
      Number(unitPrice)        || 0,
      Number(costPrice)        || 0,
      Number(reorderThreshold) || 0,
      0,          // Current Stock — starts at 0
      'In Stock', // Default SKU status
      notes || '',
    ]);
  } finally {
    lock.releaseLock();
  }

  logActivity('ADD_PRODUCT', 'Product added: ' + skuId + ' ' + skuName, skuId, email);
  return ok({ message: 'Product added.', skuId });
}
