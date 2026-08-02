/**
 * api.js
 * All communication with the Google Sheets backend lives here.
 * UI code never calls fetch() directly — it calls these functions.
 */

const Api = (() => {

  /**
   * GET requests. Apps Script web apps only support GET/POST cleanly
   * from the browser, so reads go through query params.
   */
  async function getRequest(action, params = {}) {
    const url = new URL(CONFIG.API_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('apiKey', CONFIG.API_KEY);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), { method: 'GET' });
    return parseResponse(res);
  }

  /**
   * POST requests. Sent as text/plain to avoid triggering a CORS
   * preflight, which Apps Script web apps don't handle. The backend
   * still parses the body as JSON.
   */
  async function postRequest(action, payload = {}) {
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, apiKey: CONFIG.API_KEY, payload })
    });
    return parseResponse(res);
  }

  async function parseResponse(res) {
    if (!res.ok) {
      throw new ApiError(`Network error (${res.status})`);
    }
    let json;
    try {
      json = await res.json();
    } catch (e) {
      throw new ApiError('Received an invalid response from the server.');
    }
    if (!json.success) {
      throw new ApiError(json.error || 'The request failed.');
    }
    return json.data;
  }

  class ApiError extends Error {}

  // ---------- public API ----------

  return {
    ApiError,

    getBookings() {
      return getRequest('getBookings');
    },

    getServices() {
      return getRequest('getServices');
    },

    getArchive() {
      return getRequest('getArchive');
    },

    createBooking(booking) {
      return postRequest('createBooking', booking);
    },

    updateBooking(bookingId, changes) {
      return postRequest('updateBooking', { bookingId, ...changes });
    },

    archiveBooking(bookingId) {
      return postRequest('archiveBooking', { bookingId });
    }
  };
})();
