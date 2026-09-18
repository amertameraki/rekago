// ============================================================
// Router.gs — Rekago Backend
// Single entry point. Routes doGet and doPost to the right module.
// This is the only file that contains doGet() and doPost().
// ============================================================

// ── doGet — PUBLIC (no auth required) ────────────────────
function doGet(e) {
  const action = (e.parameter.action || '').trim();

  try {
    switch (action) {
      case 'getProducts':  return ok({ data: getProductsPublic() });
      case 'getItems':     return ok({ data: getItems() });
      case 'getSettings':  return ok({ data: getSettings() });
      case 'ping':         return ok({ message: 'Rekago backend is live.' });
      default:             return err('Unknown action: ' + action, 404);
    }
  } catch (e) {
    return serverError(e);
  }
}

// ── doPost — PRIVATE (verified Google Sign-In required for all) ──
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (_) {
    return err('Invalid JSON body.', 400);
  }

  const { action } = body;

  // Auth check — verifies body.idToken with Google and resolves it to an
  // authorized email. Every handler below uses this `email`, never any
  // email the client might have sent directly in the body — the client
  // can no longer just claim to be someone else.
  const auth = requireAuth(body);
  if (auth.error) return auth.error;
  const email = auth.email;

  try {
    switch (action) {

      // ── Auth ──
      case 'login':
        logActivity('LOGIN', 'User logged in via Try Live', '', email);
        return ok({ message: 'Access granted.', email });

      // ── Private reads ──
      // getProducts here (unlike the doGet version above) includes Cost
      // Price — safe because it's gated by the verified sign-in above.
      case 'getProducts':     return ok({ data: getProducts() });
      case 'getStockIn':      return ok({ data: getStockIn() });
      case 'getStockOut':     return ok({ data: getStockOut() });
      case 'getSalesOrders':  return ok({ data: getSalesOrders() });
      case 'getPackingLists': return ok({ data: getPackingLists() });
      case 'getActivityLog':  return ok({ data: getActivityLog() });

      // ── Writes ──
      case 'addProduct':       return addProduct(body, email);
      case 'addStockIn':       return addStockIn(body, email);
      case 'addStockOut':      return addStockOut(body, email);
      case 'createSO':         return createSO(body, email);
      case 'updateItemStatus': return updateItemStatus(body, email);

      default: return err('Unknown action: ' + action, 404);
    }
  } catch (e) {
    return serverError(e);
  }
}
