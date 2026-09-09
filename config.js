// This file is committed and public — that's required for GitHub Pages to
// serve it (there's no server-side templating/secret injection here). That's
// fine: neither value below is a secret. The Web App URL only grants public
// reads (getProducts/getItems/getSettings); every write action is checked
// server-side against a Google-signed Sign-In token, so knowing this URL
// does not grant access on its own. The OAuth Client ID is likewise meant
// to be public — Google's Sign-In flow has no client-side secret.
window.REKAGO_CONFIG = {
  gsUrl: 'https://script.google.com/macros/s/AKfycbzgeD4tOE1xtw8FeBP28kATz58_pmVtwsKjh2FcXH08jkMGz2Eor7Q2EFvHzVd-z65m/exec',
  // Google OAuth Client ID (Web application) — from Google Cloud Console →
  // APIs & Services → Credentials. Must match GOOGLE_CLIENT_ID in Config.gs.
  googleClientId: '1068898361135-edullttdrgmci35rbse7h3pr8r1of0hr.apps.googleusercontent.com',
};
