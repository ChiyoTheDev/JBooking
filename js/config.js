/**
 * Front-end configuration.
 * Fill these in after deploying backend/Code.gs as a Web App
 * (see the setup comment at the top of that file).
 */
const CONFIG = Object.freeze({
  // Your Apps Script Web App deployment URL, ending in /exec
  API_URL: 'https://script.google.com/macros/s/AKfycbxC2kw8eyKF55UcPZuKW6DLGJQX94rLtd3egeoD7g-0w_LKP-bDY2ZyD0WDtOtI6SAjeg/exec',

  // Must match the API_KEY constant in backend/Code.gs
  API_KEY: 'automotivedetailing',

  COMPANY_NAME: 'John & Jans Auto Detailing',
  COMPANY_TAGLINE: 'Carwash-Auto Detailing-PPF-Tint',

  STATUSES: ['Pending', 'Ongoing', 'Completed', 'Cancelled'],

  CURRENCY_SYMBOL: 'PHP',

  // How often the table page silently checks the sheet for changes made
  // from other devices/browsers (milliseconds). Lower = more "live" but
  // more Apps Script requests. 20s is a reasonable default for a small team.
  POLL_INTERVAL_MS: 20000,

  // How long the booking form's Services dropdown is cached in this
  // browser tab before it's treated as stale (milliseconds). The cached
  // list still renders instantly; a fresh copy is fetched in the
  // background and swapped in if it changed.
  SERVICES_CACHE_TTL_MS: 5 * 60 * 1000,

  // Name used for the same-device cross-tab sync channel (see api.js /
  // booking.js / table.js). Purely local to the browser — does not
  // reach other devices.
  SYNC_CHANNEL_NAME: 'J&J-bookings-sync'
});
