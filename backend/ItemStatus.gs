// ============================================================
// ItemStatus.gs — Rekago Backend
// Updates item lifecycle stage and writes to Item Status Log.
// ============================================================

/**
 * Updates a single item's lifecycle stage.
 * Writes the change to both the Items sheet and Item Status Log.
 */
function updateItemStatus(body, email) {
  const { itemId, newStage, notes } = body;

  if (!itemId)   return err('itemId is required.', 400);
  if (!newStage) return err('newStage is required.', 400);

  const sheet    = getItemsSheet();
  const data     = sheet.getDataRange().getValues();
  let found      = false;
  let prevStage  = '';
  let itemName   = '';

  for (let i = 1; i < data.length; i++) {
    if (data[i][COL.ITEMS.ITEM_ID - 1] === itemId) {
      prevStage = data[i][COL.ITEMS.STATUS - 1];
      itemName  = data[i][COL.ITEMS.ITEM_NAME - 1];
      sheet.getRange(i + 1, COL.ITEMS.STATUS).setValue(newStage);
      sheet.getRange(i + 1, COL.ITEMS.STATUS_UPDATED).setValue(todayDate());
      found = true;
      break;
    }
  }

  if (!found) return err('Item not found: ' + itemId, 404);

  // Write to Item Status Log
  getItemLogSheet().appendRow([
    nowIso(),
    itemId,
    itemName,
    prevStage,
    newStage,
    email,
    notes || '',
  ]);

  logActivity(
    'UPDATE_ITEM_STATUS',
    itemId + ': ' + prevStage + ' → ' + newStage,
    itemId,
    email
  );

  return ok({ message: 'Item status updated.', itemId, prevStage, newStage });
}
