/**
 * ============================================================
 *  LUMIÈRE DETAIL — Booking System backend
 *  Google Apps Script Web App
 * ============================================================
 *  This script turns a Google Sheet into a small JSON API that
 *  the front end (js/api.js) talks to over fetch().
 *
 *  SETUP
 *  1. Create a Google Sheet with three tabs, named exactly:
 *       Bookings   Services   Archive
 *  2. Bookings & Archive header row (row 1), columns A–I:
 *       Booking ID | Name | Date | Service | Status | Price | Remarks | Created At | Updated At
 *  3. Services header row (row 1), columns A–D:
 *       Service Name | Price | Description | Active
 *  4. Extensions → Apps Script, delete any boilerplate, paste this
 *     whole file in as Code.gs.
 *  5. Change API_KEY below to a random string only you know.
 *  6. Deploy → New deployment → type "Web app".
 *       - Execute as: Me
 *       - Who has access: Anyone
 *     Copy the deployment URL.
 *  7. Paste that URL and your API_KEY into js/config.js on the
 *     front end.
 * ============================================================
 */

const API_KEY = 'REPLACE_WITH_A_LONG_RANDOM_SECRET';

const SHEET_BOOKINGS = 'Bookings';
const SHEET_SERVICES = 'Services';
const SHEET_ARCHIVE = 'Archive';

const BOOKING_HEADERS = [
  'Booking ID', 'Name', 'Date', 'Service', 'Status',
  'Price', 'Remarks', 'Created At', 'Updated At'
];
const SERVICE_HEADERS = ['Service Name', 'Price', 'Description', 'Active'];

// ---------- entry points ----------

function doGet(e) {
  try {
    const action = e.parameter.action;
    checkAuth_(e.parameter.apiKey);

    switch (action) {
      case 'getBookings':
        return respond_(true, readSheetAsObjects_(SHEET_BOOKINGS, BOOKING_HEADERS));
      case 'getServices':
        return respond_(true, readSheetAsObjects_(SHEET_SERVICES, SERVICE_HEADERS)
          .filter(s => String(s['Active']).toUpperCase() !== 'FALSE'));
      case 'getArchive':
        return respond_(true, readSheetAsObjects_(SHEET_ARCHIVE, BOOKING_HEADERS));
      default:
        return respond_(false, null, 'Unknown action: ' + action);
    }
  } catch (err) {
    return respond_(false, null, err.message);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    checkAuth_(body.apiKey);
    const action = body.action;
    const payload = body.payload || {};

    switch (action) {
      case 'createBooking':
        return respond_(true, createBooking_(payload));
      case 'updateBooking':
        return respond_(true, updateBooking_(payload));
      case 'archiveBooking':
        return respond_(true, archiveBooking_(payload));
      default:
        return respond_(false, null, 'Unknown action: ' + action);
    }
  } catch (err) {
    return respond_(false, null, err.message);
  }
}

// ---------- auth ----------

function checkAuth_(key) {
  if (!key || key !== API_KEY) {
    throw new Error('Unauthorized: missing or invalid API key.');
  }
}

// ---------- sheet helpers ----------

function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name);
  return sheet;
}

function readSheetAsObjects_(sheetName, headers) {
  const sheet = getSheet_(sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map((row, i) => {
      const obj = { _row: i + 2 }; // remember sheet row for updates
      headers.forEach((h, idx) => { obj[h] = row[idx]; });
      return obj;
    });
}

function findRowByBookingId_(sheet, bookingId) {
  const data = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 0), 1).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(bookingId)) return i + 2;
  }
  return -1;
}

// ---------- booking operations ----------

function createBooking_(payload) {
  const sheet = getSheet_(SHEET_BOOKINGS);
  const now = new Date().toISOString();
  const id = 'BK-' + new Date().getTime().toString(36).toUpperCase();

  const row = [
    id,
    payload.name || '',
    payload.date || '',
    payload.service || '',
    payload.status || 'Pending',
    payload.price || 0,
    payload.remarks || '',
    now,
    now
  ];
  sheet.appendRow(row);
  const obj = {};
  BOOKING_HEADERS.forEach((h, idx) => { obj[h] = row[idx]; });
  return obj;
}

function updateBooking_(payload) {
  const sheet = getSheet_(SHEET_BOOKINGS);
  const rowIndex = findRowByBookingId_(sheet, payload.bookingId);
  if (rowIndex === -1) throw new Error('Booking not found: ' + payload.bookingId);

  const now = new Date().toISOString();
  const existing = sheet.getRange(rowIndex, 1, 1, BOOKING_HEADERS.length).getValues()[0];

  const updated = [
    existing[0], // Booking ID never changes
    payload.name !== undefined ? payload.name : existing[1],
    payload.date !== undefined ? payload.date : existing[2],
    payload.service !== undefined ? payload.service : existing[3],
    payload.status !== undefined ? payload.status : existing[4],
    payload.price !== undefined ? payload.price : existing[5],
    payload.remarks !== undefined ? payload.remarks : existing[6],
    existing[7],
    now
  ];
  sheet.getRange(rowIndex, 1, 1, updated.length).setValues([updated]);

  const obj = {};
  BOOKING_HEADERS.forEach((h, idx) => { obj[h] = updated[idx]; });
  return obj;
}

function archiveBooking_(payload) {
  const bookingsSheet = getSheet_(SHEET_BOOKINGS);
  const archiveSheet = getSheet_(SHEET_ARCHIVE);
  const rowIndex = findRowByBookingId_(bookingsSheet, payload.bookingId);
  if (rowIndex === -1) throw new Error('Booking not found: ' + payload.bookingId);

  const rowValues = bookingsSheet.getRange(rowIndex, 1, 1, BOOKING_HEADERS.length).getValues()[0];
  archiveSheet.appendRow(rowValues);
  bookingsSheet.deleteRow(rowIndex);

  return { bookingId: payload.bookingId, archived: true };
}

// ---------- response helper ----------

function respond_(success, data, error) {
  const body = { success: success };
  if (data !== undefined && data !== null) body.data = data;
  if (error) body.error = error;
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}
