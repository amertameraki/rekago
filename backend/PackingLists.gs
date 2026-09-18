// ============================================================
// PackingLists.gs — Rekago Backend
// Read-only packing-list operations for the first implementation slice.
// ============================================================

/**
 * Returns packing-list headers with their line items nested under `lines`.
 * This function is exposed only through authenticated doPost routing.
 */
function getPackingLists() {
  const headers = sheetToObjects(SHEET.PACKING_LISTS);
  const lineRows = sheetToObjects(SHEET.PACKING_LIST_LINES);

  const linesByNumber = {};
  lineRows.forEach(row => {
    const number = String(row['PL Number'] || '').trim();
    if (!number) return;
    if (!linesByNumber[number]) linesByNumber[number] = [];
    linesByNumber[number].push({
      lineNumber: Number(row['Line Number']) || 0,
      skuId: String(row['SKU ID'] || '').trim(),
      itemId: String(row['Item ID'] || '').trim(),
      productName: String(row['Product Name'] || '').trim(),
      itemName: String(row['Item Name'] || '').trim(),
      qty: Number(row['Qty']) || 0,
      unitCost: Number(row['Unit Cost (IDR)']) || 0,
      totalCost: Number(row['Total Cost (IDR)']) || 0,
    });
  });

  Object.keys(linesByNumber).forEach(number => {
    linesByNumber[number].sort((a, b) => a.lineNumber - b.lineNumber);
  });

  return headers.filter(row => String(row['PL Number'] || '').trim()).map(row => {
    const number = String(row['PL Number'] || '').trim();
    return {
      number,
      date: packingListDate(row['Date']),
      supplier: String(row['Supplier'] || '').trim(),
      status: String(row['Status'] || '').trim(),
      notes: String(row['Notes'] || '').trim(),
      totalLines: Number(row['Total Lines']) || 0,
      totalQty: Number(row['Total Qty']) || 0,
      totalCost: Number(row['Total Cost (IDR)']) || 0,
      createdBy: String(row['Created By'] || '').trim(),
      createdAt: packingListTimestamp(row['Created At']),
      receivedBy: String(row['Received By'] || '').trim(),
      receivedAt: packingListTimestamp(row['Received At']),
      cancelledBy: String(row['Cancelled By'] || '').trim(),
      cancelledAt: packingListTimestamp(row['Cancelled At']),
      lines: linesByNumber[number] || [],
    };
  });
}

function packingListDate(value) {
  if (!value) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value).slice(0, 10);
}

function packingListTimestamp(value) {
  if (!value) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Creates one packing-list header and its item lines.
 * Product names, item names, totals, timestamps, and user attribution are
 * resolved server-side rather than trusted from the browser.
 */
function createPackingList(body, email) {
  const number = String(body.number || '').trim();
  const date = String(body.date || todayDate()).trim();
  const supplier = String(body.supplier || '').trim();
  const status = String(body.status || 'Draft').trim();
  const notes = String(body.notes || '').trim();
  const lines = Array.isArray(body.lines) ? body.lines : [];

  if (!number) return err('number is required.', 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return err('date must use YYYY-MM-DD format.', 400);
  }
  if (!['Draft', 'In Transit'].includes(status)) {
    return err('status must be Draft or In Transit.', 400);
  }
  if (!lines.length) return err('At least one packing-list line is required.', 400);

  const productsBySku = {};
  getProducts().forEach(product => {
    const skuId = String(product['SKU ID'] || '').trim();
    if (skuId) productsBySku[skuId] = product;
  });

  const itemsById = {};
  getItems().forEach(item => {
    const itemId = String(item['Item ID'] || '').trim();
    if (itemId) itemsById[itemId] = item;
  });

  const normalizedLines = [];
  for (let index = 0; index < lines.length; index++) {
    const input = lines[index] || {};
    const skuId = String(input.skuId || '').trim();
    const itemId = String(input.itemId || '').trim();
    const qty = Number(input.qty);
    const unitCost = Number(input.unitCost);
    const lineLabel = 'Line ' + (index + 1);

    if (!skuId) return err(lineLabel + ': skuId is required.', 400);
    if (!itemId) return err(lineLabel + ': itemId is required.', 400);
    if (!Number.isInteger(qty) || qty < 1) {
      return err(lineLabel + ': qty must be a positive whole number.', 400);
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      return err(lineLabel + ': unitCost must be a non-negative number.', 400);
    }

    const product = productsBySku[skuId];
    const item = itemsById[itemId];
    if (!product) return err(lineLabel + ': SKU not found: ' + skuId, 400);
    if (!item) return err(lineLabel + ': Item not found: ' + itemId, 400);
    if (String(item['SKU ID'] || '').trim() !== skuId) {
      return err(lineLabel + ': Item does not belong to SKU ' + skuId + '.', 400);
    }

    normalizedLines.push({
      lineNumber: index + 1,
      skuId,
      itemId,
      productName: String(product['SKU Name'] || '').trim(),
      itemName: String(item['Item Name'] || '').trim(),
      qty,
      unitCost,
      totalCost: qty * unitCost,
    });
  }

  const totalQty = normalizedLines.reduce((sum, line) => sum + line.qty, 0);
  const totalCost = normalizedLines.reduce((sum, line) => sum + line.totalCost, 0);
  const headerSheet = getPackingListsSheet();
  const linesSheet = getPackingListLinesSheet();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return err('Server is busy, please try again.', 503);

  let headerRow = 0;
  try {
    const existingNumbers = getPackingLists()
      .map(list => list.number)
      .filter(Boolean);
    if (existingNumbers.includes(number)) {
      return err('PL Number already exists: ' + number, 409);
    }

    headerRow = headerSheet.getLastRow() + 1;
    headerSheet.getRange(headerRow, 1, 1, 14).setValues([[
      number,
      date,
      supplier,
      status,
      notes,
      normalizedLines.length,
      totalQty,
      totalCost,
      email,
      nowIso(),
      '',
      '',
      '',
      '',
    ]]);

    const lineRows = normalizedLines.map(line => [
      number,
      line.lineNumber,
      line.skuId,
      line.itemId,
      line.productName,
      line.itemName,
      line.qty,
      line.unitCost,
      line.totalCost,
    ]);
    const firstLineRow = linesSheet.getLastRow() + 1;
    linesSheet.getRange(firstLineRow, 1, lineRows.length, 9).setValues(lineRows);
  } catch (e) {
    if (headerRow) headerSheet.getRange(headerRow, 1, 1, 14).clearContent();
    throw e;
  } finally {
    lock.releaseLock();
  }

  logActivity(
    'CREATE_PACKING_LIST',
    'Packing List created: ' + number + ' (' + totalQty + ' units)',
    number,
    email
  );

  return ok({ message: 'Packing List created.', number });
}
