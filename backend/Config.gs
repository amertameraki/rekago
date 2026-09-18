// ============================================================
// Config.gs — Rekago Backend
// Central constants. Every other .gs file reads from here.
// ============================================================

// ── Sheet names ───────────────────────────────────────────
const SHEET = {
  SKUS:         'SKUs',
  ITEMS:        'Items',
  STOCK_IN:     'Stock In',
  STOCK_OUT:    'Stock Out',
  SALES_ORDERS: 'Sales Orders',
  ITEM_LOG:     'Item Status Log',
  ACTIVITY_LOG: 'Activity Log',
  SETTINGS:     'Settings',
  AUTH_USERS:   'AuthorizedUsers',
};

// ── Column indexes (1-based) ──────────────────────────────
const COL = {
  SKUS: {
    SKU_ID: 1, SKU_NAME: 2, CATEGORY: 3, CHANNELS: 4,
    UNIT_PRICE: 5, COST_PRICE: 6, REORDER: 7, STOCK: 8,
    STATUS: 9, NOTES: 10,
  },
  ITEMS: {
    ITEM_ID: 1, SKU_ID: 2, ITEM_NAME: 3, VARIANT: 4,
    VARIANT_VALUE: 5, STATUS: 6, STATUS_UPDATED: 7,
    LISTED_ON: 8, NOTES: 9,
  },
  STOCK_IN: {
    DATE: 1, REF_ID: 2, SKU_ID: 3, ITEM_ID: 4, PRODUCT_NAME: 5,
    CATEGORY: 6, SUPPLIER: 7, QTY: 8, UNIT_COST: 9, TOTAL_COST: 10,
    TYPE: 11, NOTES: 12, RECORDED_BY: 13,
  },
  STOCK_OUT: {
    DATE: 1, REF_ID: 2, SKU_ID: 3, ITEM_ID: 4, PRODUCT_NAME: 5,
    CATEGORY: 6, CHANNEL: 7, ORDER_REF: 8, QTY: 9, UNIT_PRICE: 10,
    TOTAL_REVENUE: 11, TYPE: 12, NOTES: 13, RECORDED_BY: 14,
  },
  SALES_ORDERS: {
    SO_NUM: 1, DATE: 2, CHANNEL: 3, CUSTOMER_REF: 4, TOTAL_SKUS: 5,
    TOTAL_QTY: 6, TOTAL_REVENUE: 7, STATUS: 8, NOTES: 9,
    CREATED_BY: 10, CREATED_AT: 11,
  },
  ITEM_LOG: {
    TIMESTAMP: 1, ITEM_ID: 2, ITEM_NAME: 3,
    PREV_STAGE: 4, NEW_STAGE: 5, UPDATED_BY: 6, NOTES: 7,
  },
  ACTIVITY_LOG: {
    TIMESTAMP: 1, ACTION: 2, DETAIL: 3, REF_ID: 4, USER: 5,
  },
  AUTH_USERS: {
    EMAIL: 1, NAME: 2, ADDED_ON: 3, NOTES: 4,
  },
};

// ── Google Sign-In ─────────────────────────────────────────
// OAuth Client ID (Web application) from Google Cloud Console →
// APIs & Services → Credentials. Must match `googleClientId` in
// the frontend's config.js. Used to verify Sign-In ID tokens so a
// caller's email can no longer be spoofed by just typing it in.
const GOOGLE_CLIENT_ID = '1068898361135-edullttdrgmci35rbse7h3pr8r1of0hr.apps.googleusercontent.com';

// ── Sheet accessors ───────────────────────────────────────
function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(name) {
  const sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return sheet;
}

function getSkusSheet()         { return getSheet(SHEET.SKUS);         }
function getItemsSheet()        { return getSheet(SHEET.ITEMS);        }
function getStockInSheet()      { return getSheet(SHEET.STOCK_IN);     }
function getStockOutSheet()     { return getSheet(SHEET.STOCK_OUT);    }
function getSalesOrdersSheet()  { return getSheet(SHEET.SALES_ORDERS); }
function getItemLogSheet()      { return getSheet(SHEET.ITEM_LOG);     }
function getActivityLogSheet()  { return getSheet(SHEET.ACTIVITY_LOG); }
function getSettingsSheet()     { return getSheet(SHEET.SETTINGS);     }
function getAuthUsersSheet()    { return getSheet(SHEET.AUTH_USERS);   }

// ── Shared utilities ──────────────────────────────────────
function sheetToObjects(sheetName) {
  const sheet = getSheet(sheetName);
  const data  = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function nowIso() {
  return new Date().toISOString();
}

function todayDate() {
  return nowIso().slice(0, 10);
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function ok(data) {
  return respond({ ok: true, ...data });
}

function err(msg, code) {
  return respond({ ok: false, error: msg, code: code || 400 });
}

// Use for unexpected exceptions caught in doGet/doPost. Logs the real
// error (message + stack) server-side via console.error — visible in
// Apps Script's Executions log — but returns only a generic message to
// the caller, who may be unauthenticated. The raw exception message can
// include internal details (sheet/column names, etc.) that shouldn't be
// handed to an arbitrary caller probing the endpoint.
function serverError(e) {
  console.error('Unhandled error: ' + e.message + '\n' + (e.stack || ''));
  return err('Internal error. Please try again.', 500);
}
