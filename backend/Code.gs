/**
 * ============================================================
 *  JOHN & JANS AUTO DETAILING — Booking System backend
 *  Google Apps Script Web App
 * ============================================================
 *  This script turns a Google Sheet into a small JSON API that
 *  the front end (js/api.js) talks to over fetch().
 *
 *  SHEET SETUP
 *  Three tabs, named exactly: Bookings   Services   Archive
 *
 *  Bookings & Archive — header row, in this exact column order:
 *    A: Booking ID     F: Price        K: Vehicle
 *    B: Name           G: Remarks      L: Vehicle Size
 *    C: Date           H: Created At   M: Plate Number
 *    D: Service        I: Updated At
 *    E: Status         J: Time
 *
 *  (Columns A–I are the original layout — untouched on purpose so
 *  existing rows never have to move. J–M were appended for the
 *  scheduling/vehicle-detail fields added later.)
 *
 *  Services — header row, in this exact column order:
 *    A: Service Name   E: Small        I: XXL
 *    B: Price (unused  F: Medium       J: Pick Up
 *       by the app —   G: Large        K: Dirty Trail Car
 *       kept so nothing H: XL
 *       shifts)
 *    C: Description
 *    D: Active
 *
 *  The size columns (E–K) must be named exactly as above — the
 *  front end's CONFIG.VEHICLE_SIZES list matches these names and
 *  uses them to look up a service's price for the vehicle size
 *  chosen on the booking form.
 *
 *  DEPLOYING CHANGES
 *  Every time you edit this file, you must go to
 *  Deploy → Manage deployments → (pencil icon) → Version: New version → Deploy.
 *  Saving alone does NOT push changes to the live URL.
 * ============================================================
 */

const API_KEY = 'automotivedetailing';

const SHEET_BOOKINGS = 'Bookings';
const SHEET_SERVICES = 'Services';
const SHEET_ARCHIVE = 'Archive';

// Column order for Bookings/Archive. A–I is the original layout;
// J onward was appended later — do not reorder existing entries.
const BOOKING_HEADERS = [
  'Booking ID', 'Name', 'Date', 'Service', 'Status',
  'Price', 'Remarks', 'Created At', 'Updated At',
  'Time', 'Mobile No.', 'Vehicle', 'Vehicle Size', 'Plate Number'
];

// Maps each editable Bookings field to the payload key the front end
// sends it under. Booking ID / Created At / Updated At are handled
// separately (system-managed, never taken from the payload).
const BOOKING_PAYLOAD_KEYS = {
  'Name': 'name',
  'Date': 'date',
  'Service': 'service',
  'Status': 'status',
  'Price': 'price',
  'Remarks': 'remarks',
  'Time': 'time',
  'Mobile No.': 'mobile',
  'Vehicle': 'vehicle',
  'Vehicle Size': 'vehicleSize',
  'Plate Number': 'plateNumber'
};

// Column order for Services. A–D is the original layout (Price at B
// is no longer read by the app, kept only so nothing shifts);
// E onward are the per-vehicle-size prices.
const SERVICE_HEADERS = [
  'Service Name', 'Price', 'Description', 'Active',
  'Small', 'Medium', 'Large', 'XL', 'XXL', 'Pick Up', 'Dirty Trail Car'
];

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
// Both functions build a { header -> value } map first, then turn it
// into a row using BOOKING_HEADERS as the single source of truth for
// column order. This way adding/reordering a field only ever needs to
// happen in BOOKING_HEADERS / BOOKING_PAYLOAD_KEYS, never in index math.

function createBooking_(payload) {
  const sheet = getSheet_(SHEET_BOOKINGS);
  const now = new Date().toISOString();
  const id = 'BK-' + new Date().getTime().toString(36).toUpperCase();

  const values = { 'Booking ID': id, 'Created At': now, 'Updated At': now };
  Object.keys(BOOKING_PAYLOAD_KEYS).forEach(function (header) {
    const key = BOOKING_PAYLOAD_KEYS[header];
    values[header] = payload[key] !== undefined ? payload[key] : (header === 'Status' ? 'Pending' : '');
  });

  const row = BOOKING_HEADERS.map(function (h) { return values[h] !== undefined ? values[h] : ''; });
  sheet.appendRow(row);

  const obj = {};
  BOOKING_HEADERS.forEach(function (h, idx) { obj[h] = row[idx]; });
  return obj;
}

function updateBooking_(payload) {
  const sheet = getSheet_(SHEET_BOOKINGS);
  const rowIndex = findRowByBookingId_(sheet, payload.bookingId);
  if (rowIndex === -1) throw new Error('Booking not found: ' + payload.bookingId);

  const now = new Date().toISOString();
  const existingRow = sheet.getRange(rowIndex, 1, 1, BOOKING_HEADERS.length).getValues()[0];
  const existing = {};
  BOOKING_HEADERS.forEach(function (h, idx) { existing[h] = existingRow[idx]; });

  const updated = Object.assign({}, existing, { 'Updated At': now });
  Object.keys(BOOKING_PAYLOAD_KEYS).forEach(function (header) {
    const key = BOOKING_PAYLOAD_KEYS[header];
    if (payload[key] !== undefined) updated[header] = payload[key];
  });

  const row = BOOKING_HEADERS.map(function (h) { return updated[h]; });
  sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);

  const obj = {};
  BOOKING_HEADERS.forEach(function (h, idx) { obj[h] = row[idx]; });
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
