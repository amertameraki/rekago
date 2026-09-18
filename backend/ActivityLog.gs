// ============================================================
// ActivityLog.gs — Rekago Backend
// Writes and reads the Activity Log sheet.
// ============================================================

/**
 * Appends one row to the Activity Log.
 * Called by every write action in other modules.
 */
function logActivity(action, detail, refId, user) {
  try {
    getActivityLogSheet().appendRow([
      nowIso(),
      action,
      detail   || '',
      refId    || '',
      user     || '',
    ]);
  } catch (e) {
    // Never let a logging failure break the main action
    console.error('logActivity failed:', e.message);
  }
}

/**
 * Returns the last N rows of the Activity Log, newest first.
 * Default: 50 rows.
 */
function getActivityLog(limit) {
  const rows = sheetToObjects(SHEET.ACTIVITY_LOG);
  return rows.reverse().slice(0, limit || 50);
}
