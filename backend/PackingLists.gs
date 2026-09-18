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
