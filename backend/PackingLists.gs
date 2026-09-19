// ============================================================
// PackingLists.gs — Rekago Backend
// Packing-list operations. The detail sheet keeps the existing "PL Line Items"
// columns and adds new fields only at the right-hand side when first needed.
// ============================================================

const PACKING_LIST_HEADERS = [
  'PL Number', 'Date', 'Supplier', 'Status', 'Notes',
  'Total Lines', 'Total Qty', 'Total Cost (IDR)',
  'Created By', 'Created At', 'Received By', 'Received At',
  'Cancelled By', 'Cancelled At',
];

const PACKING_LIST_LINE_HEADERS = [
  'PL Number', 'SKU ID', 'Product Name', 'Qty', 'Unit Cost', 'Total Cost',
  'Created By', 'Created At', 'Line Number', 'Item ID', 'Item Name',
];

function packingListValue(row, names) {
  for (let index = 0; index < names.length; index++) {
    const value = row[names[index]];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return '';
}

/**
 * Preserves every existing header and appends only missing required headers.
 * Nothing is renamed, reordered, or removed.
 */
function ensurePackingListHeaders(sheet, requiredHeaders) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(value => String(value || '').trim());

  while (headers.length && !headers[headers.length - 1]) headers.pop();

  const present = {};
  headers.forEach(header => {
    if (!header) return;
    if (present[header]) throw new Error('Duplicate sheet header: ' + header);
    present[header] = true;
  });

  const missing = requiredHeaders.filter(header => !present[header]);
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    headers.push(...missing);
  }
  return headers;
}

function appendPackingListRows(sheet, rows, requiredHeaders) {
  const headers = ensurePackingListHeaders(sheet, requiredHeaders);
  const values = rows.map(row => headers.map(header =>
    Object.prototype.hasOwnProperty.call(row, header) ? row[header] : ''
  ));
  const firstRow = sheet.getLastRow() + 1;
  sheet.getRange(firstRow, 1, values.length, headers.length).setValues(values);
  return firstRow;
}

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
    const fallbackLineNumber = linesByNumber[number].length + 1;
    const productName = String(row['Product Name'] || '').trim();
    linesByNumber[number].push({
      lineNumber: Number(row['Line Number']) || fallbackLineNumber,
      skuId: String(row['SKU ID'] || '').trim(),
      itemId: String(row['Item ID'] || '').trim(),
      productName,
      itemName: String(row['Item Name'] || productName).trim(),
      qty: Number(row['Qty']) || 0,
      unitCost: Number(packingListValue(row, ['Unit Cost', 'Unit Cost (IDR)'])) || 0,
      totalCost: Number(packingListValue(row, ['Total Cost', 'Total Cost (IDR)'])) || 0,
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
      totalCost: Number(packingListValue(row, ['Total Cost (IDR)', 'Total Cost'])) || 0,
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

    const createdAt = nowIso();
    headerRow = appendPackingListRows(headerSheet, [{
      'PL Number': number,
      'Date': date,
      'Supplier': supplier,
      'Status': status,
      'Notes': notes,
      'Total Lines': normalizedLines.length,
      'Total Qty': totalQty,
      'Total Cost (IDR)': totalCost,
      'Created By': email,
      'Created At': createdAt,
      'Received By': '',
      'Received At': '',
      'Cancelled By': '',
      'Cancelled At': '',
    }], PACKING_LIST_HEADERS);

    const lineRows = normalizedLines.map(line => ({
      'PL Number': number,
      'SKU ID': line.skuId,
      'Product Name': line.productName,
      'Qty': line.qty,
      'Unit Cost': line.unitCost,
      'Total Cost': line.totalCost,
      'Created By': email,
      'Created At': createdAt,
      'Line Number': line.lineNumber,
      'Item ID': line.itemId,
      'Item Name': line.itemName,
    }));
    appendPackingListRows(linesSheet, lineRows, PACKING_LIST_LINE_HEADERS);
  } catch (e) {
    if (headerRow) {
      headerSheet.getRange(headerRow, 1, 1, headerSheet.getLastColumn()).clearContent();
    }
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
