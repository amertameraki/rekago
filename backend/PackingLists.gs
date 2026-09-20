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

function packingListColumn(headers, name) {
  const index = headers.indexOf(name);
  if (index < 0) throw new Error('Missing sheet header: ' + name);
  return index + 1;
}

/**
 * Returns packing-list headers with their line items nested under `lines`.
 * This function is exposed only through authenticated doPost routing.
 */
function getPackingLists() {
  const headers = sheetToObjects(SHEET.PACKING_LISTS);
  const lineRows = sheetToObjects(SHEET.PACKING_LIST_LINES);

  const linesByNumber = {};
  const legacyMetaByNumber = {};
  lineRows.forEach(row => {
    const number = String(row['PL Number'] || '').trim();
    if (!number) return;
    if (!linesByNumber[number]) linesByNumber[number] = [];
    if (!legacyMetaByNumber[number]) {
      legacyMetaByNumber[number] = {
        createdBy: String(row['Created By'] || '').trim(),
        createdAt: packingListTimestamp(row['Created At']),
      };
    }
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

  const lists = headers.filter(row => String(row['PL Number'] || '').trim()).map(row => {
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

  // The user's previous Packing Lists sheet may have been replaced while its
  // PL Line Items were retained. Keep those groups visible without rewriting
  // the sheet or inventing supplier data. They stay Draft until reconciled.
  const headerNumbers = {};
  lists.forEach(list => { headerNumbers[list.number] = true; });
  Object.keys(linesByNumber).forEach(number => {
    if (headerNumbers[number]) return;
    const lines = linesByNumber[number];
    const meta = legacyMetaByNumber[number] || {};
    lists.push({
      number,
      date: packingListDate(meta.createdAt),
      supplier: '',
      status: 'Draft',
      notes: 'Recovered from existing PL Line Items; supplier and Item IDs need review.',
      totalLines: lines.length,
      totalQty: lines.reduce((sum, line) => sum + line.qty, 0),
      totalCost: lines.reduce((sum, line) => sum + line.totalCost, 0),
      createdBy: meta.createdBy || '',
      createdAt: meta.createdAt || '',
      receivedBy: '',
      receivedAt: '',
      cancelledBy: '',
      cancelledAt: '',
      lines,
    });
  });

  return lists;
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
    // getPackingLists includes both normal header rows and retained legacy
    // detail groups, so a number cannot be reused while old line items exist.
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

/**
 * Receives a complete packing list in one operation. Every line becomes one
 * Stock In row, SKU stock is increased by the aggregated line quantity, and
 * the packing-list header is marked Received. A retained legacy line group
 * without a real header or Item IDs must be reconciled before it can receive.
 */
function receivePackingList(body, email) {
  const number = String(body.number || '').trim();
  if (!number) return err('number is required.', 400);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return err('Server is busy, please try again.', 503);

  try {
    const list = getPackingLists().find(entry => entry.number === number);
    if (!list) return err('Packing List not found: ' + number, 404);

    const headerSheet = getPackingListsSheet();
    const headers = ensurePackingListHeaders(headerSheet, PACKING_LIST_HEADERS);
    const headerData = headerSheet.getDataRange().getValues();
    const numberColumn = packingListColumn(headers, 'PL Number');
    let headerRow = 0;
    for (let rowIndex = 1; rowIndex < headerData.length; rowIndex++) {
      if (String(headerData[rowIndex][numberColumn - 1] || '').trim() === number) {
        headerRow = rowIndex + 1;
        break;
      }
    }
    if (!headerRow) {
      return err('This recovered Packing List needs a header and Item IDs before receiving.', 409);
    }

    const statusColumn = packingListColumn(headers, 'Status');
    const receivedByColumn = packingListColumn(headers, 'Received By');
    const receivedAtColumn = packingListColumn(headers, 'Received At');
    const status = String(headerData[headerRow - 1][statusColumn - 1] || '').trim();
    if (status === 'Received') return err('Packing List is already received: ' + number, 409);
    if (status === 'Cancelled') return err('Cancelled Packing Lists cannot be received.', 409);
    if (!['Draft', 'In Transit'].includes(status)) {
      return err('Packing List must be Draft or In Transit before receiving.', 409);
    }
    if (!list.lines.length) return err('Packing List has no line items.', 409);

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

    for (let index = 0; index < list.lines.length; index++) {
      const line = list.lines[index];
      const label = 'Line ' + (index + 1);
      if (!line.skuId || !productsBySku[line.skuId]) {
        return err(label + ': SKU not found: ' + (line.skuId || '(blank)'), 409);
      }
      if (!line.itemId || !itemsById[line.itemId]) {
        return err(label + ': Item ID must be matched before receiving.', 409);
      }
      if (String(itemsById[line.itemId]['SKU ID'] || '').trim() !== line.skuId) {
        return err(label + ': Item does not belong to SKU ' + line.skuId + '.', 409);
      }
      if (!Number.isInteger(line.qty) || line.qty < 1) {
        return err(label + ': qty must be a positive whole number.', 409);
      }
      if (!Number.isFinite(line.unitCost) || line.unitCost < 0) {
        return err(label + ': unit cost is invalid.', 409);
      }
    }

    const stockInSheet = getStockInSheet();
    const existingStockIn = sheetToObjects(SHEET.STOCK_IN).some(row =>
      String(row['Reference ID'] || '').trim() === number
    );
    if (existingStockIn) {
      return err('Stock In already contains records for ' + number + '; review before retrying.', 409);
    }

    const skuSheet = getSkusSheet();
    const skuData = skuSheet.getDataRange().getValues();
    const skuSnapshots = {};
    const qtyBySku = {};
    list.lines.forEach(line => {
      qtyBySku[line.skuId] = (qtyBySku[line.skuId] || 0) + line.qty;
    });
    Object.keys(qtyBySku).forEach(skuId => {
      let row = 0;
      for (let rowIndex = 1; rowIndex < skuData.length; rowIndex++) {
        if (String(skuData[rowIndex][COL.SKUS.SKU_ID - 1] || '').trim() === skuId) {
          row = rowIndex + 1;
          break;
        }
      }
      if (!row) throw new Error('SKU row not found: ' + skuId);
      skuSnapshots[skuId] = {
        row,
        stock: Number(skuData[row - 1][COL.SKUS.STOCK - 1]) || 0,
        status: skuData[row - 1][COL.SKUS.STATUS - 1],
        reorder: Number(skuData[row - 1][COL.SKUS.REORDER - 1]) || 0,
      };
    });

    const receivedAt = nowIso();
    const stockRows = list.lines.map(line => {
      const product = productsBySku[line.skuId];
      return [
        todayDate(), number, line.skuId, line.itemId,
        String(product['SKU Name'] || line.productName || '').trim(),
        String(product['Category'] || '').trim(), list.supplier || '',
        line.qty, line.unitCost, line.qty * line.unitCost,
        'Restock', 'Received from Packing List ' + number, email,
      ];
    });
    const firstStockRow = stockInSheet.getLastRow() + 1;
    const previousHeader = {
      status: headerData[headerRow - 1][statusColumn - 1],
      receivedBy: headerData[headerRow - 1][receivedByColumn - 1],
      receivedAt: headerData[headerRow - 1][receivedAtColumn - 1],
    };
    let stockWriteStarted = false;
    let headerWriteStarted = false;

    try {
      stockWriteStarted = true;
      stockInSheet.getRange(firstStockRow, 1, stockRows.length, 13).setValues(stockRows);

      Object.keys(qtyBySku).forEach(skuId => {
        const snapshot = skuSnapshots[skuId];
        const newStock = snapshot.stock + qtyBySku[skuId];
        const newStatus = newStock <= snapshot.reorder ? 'Low Stock' : 'In Stock';
        skuSheet.getRange(snapshot.row, COL.SKUS.STOCK, 1, 2)
          .setValues([[newStock, newStatus]]);
      });

      headerWriteStarted = true;
      headerSheet.getRange(headerRow, statusColumn).setValue('Received');
      headerSheet.getRange(headerRow, receivedByColumn).setValue(email);
      headerSheet.getRange(headerRow, receivedAtColumn).setValue(receivedAt);
      SpreadsheetApp.flush();
    } catch (e) {
      if (stockWriteStarted) {
        stockInSheet.getRange(firstStockRow, 1, stockRows.length, 13).clearContent();
      }
      Object.keys(skuSnapshots).forEach(skuId => {
        const snapshot = skuSnapshots[skuId];
        skuSheet.getRange(snapshot.row, COL.SKUS.STOCK, 1, 2)
          .setValues([[snapshot.stock, snapshot.status]]);
      });
      if (headerWriteStarted) {
        headerSheet.getRange(headerRow, statusColumn).setValue(previousHeader.status);
        headerSheet.getRange(headerRow, receivedByColumn).setValue(previousHeader.receivedBy);
        headerSheet.getRange(headerRow, receivedAtColumn).setValue(previousHeader.receivedAt);
      }
      throw e;
    }

    const totalQty = list.lines.reduce((sum, line) => sum + line.qty, 0);
    logActivity(
      'RECEIVE_PACKING_LIST',
      'Packing List received: ' + number + ' (' + totalQty + ' units)',
      number,
      email
    );
    return ok({ message: 'Packing List received.', number, totalQty });
  } finally {
    lock.releaseLock();
  }
}
