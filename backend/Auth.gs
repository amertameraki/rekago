// ============================================================
// Auth.gs — Rekago Backend
// Verifies the caller's Google Sign-In ID token, then checks the
// token's verified email against the AuthorizedUsers sheet.
// ============================================================

/**
 * Verifies a Google Sign-In ID token via Google's tokeninfo endpoint
 * (which validates the JWT signature and expiry for us) and returns
 * the verified, lowercased email it asserts.
 *
 * Returns null if the token is missing, invalid, expired, was issued
 * for a different OAuth client, or its email isn't verified by Google.
 * A caller can never supply this email directly — it only ever comes
 * from a signature Google has already checked.
 */
function verifiedEmailFromIdToken(idToken) {
  if (!idToken) return null;
  try {
    const resp = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    if (resp.getResponseCode() !== 200) return null;

    const info = JSON.parse(resp.getContentText());
    if (info.aud !== GOOGLE_CLIENT_ID) return null;
    if (info.email_verified !== 'true' && info.email_verified !== true) return null;
    if (!info.email) return null;

    return info.email.toString().trim().toLowerCase();
  } catch (e) {
    return null;
  }
}

/**
 * Returns true if the (already-verified) email exists in AuthorizedUsers.
 * Comparison is case-insensitive and trimmed.
 * If AuthorizedUsers sheet is missing, denies all access.
 */
function isAuthorized(email) {
  if (!email) return false;

  try {
    const sheet = getAuthUsersSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return false;

    const emails = sheet
      .getRange(2, COL.AUTH_USERS.EMAIL, lastRow - 1, 1)
      .getValues()
      .flat()
      .map(e => e.toString().trim().toLowerCase())
      .filter(e => e.length > 0);

    return emails.includes(email);
  } catch (e) {
    // Sheet missing — deny all
    return false;
  }
}

/**
 * Middleware-style check. Call at the top of doPost with the parsed body.
 * Verifies body.idToken with Google, then checks the verified email
 * against AuthorizedUsers.
 *
 * Returns { email } on success (the verified, authorized email — use
 * this, never body.email, for logging/attribution), or { error } with
 * an error response to return immediately.
 */
function requireAuth(body) {
  const email = verifiedEmailFromIdToken(body.idToken);
  if (!email) {
    return { error: err('Invalid or expired sign-in. Please sign in again.', 401) };
  }
  if (!isAuthorized(email)) {
    return { error: err('Email not authorized. Contact the sheet owner to request access.', 403) };
  }
  return { email: email };
}
