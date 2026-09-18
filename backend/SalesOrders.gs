// ============================================================
// SalesOrders.gs — Rekago Backend
// Handles Sales Orders: read and create.
// ============================================================

// ── READ ─────────────────────────────────────────────────

function getSalesOrders() {
  return sheetToObjects(SHEET.SALES_ORDERS);
}

// ── WRITE ────────────────────────────────────────────────

/**
 * Creates a new Sales Order row.
 */
function createSO(body, email) {
  const {
    soNumber, date, channel, customerRef,
    totalSkus, totalQty, totalRevenue, status, notes,
  } = body;

  if (!soNumber) return err('soNumber is required.', 400);
  if (!channel)  return err('channel is required.', 400);

  // Lock around the check-then-append so two near-simultaneous requests
  // for the same soNumber can't both pass the duplicate check.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return err('Server is busy, please try again.', 503);
  try {
    const existing = getSalesOrders().map(r => r['SO Number']);
    if (existing.includes(soNumber)) {
      return err('SO Number already exists: ' + soNumber, 409);
    }

    getSalesOrdersSheet().appendRow([
      soNumber,
      date          || todayDate(),
      channel,
      customerRef   || '',
      Number(totalSkus)    || 1,
      Number(totalQty)     || 0,
      Number(totalRevenue) || 0,
      status        || 'Pending',
      notes         || '',
      email,
      nowIso(),
    ]);
  } finally {
    lock.releaseLock();
  }

  logActivity(
    'CREATE_SO',
    'Sales Order created: ' + soNumber + ' ' + channel,
    soNumber,
    email
  );

  return ok({ message: 'Sales Order created.', soNumber });
}
