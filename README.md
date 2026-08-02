# Lumière Detail — Booking Management System

A booking system for an automotive detailing business, built with HTML5, Tailwind-flavored custom CSS, vanilla JavaScript, and a Google Sheet as the database. No build step, no framework — open the HTML files and go.

## What's inside

```
index.html          Dashboard / landing page
booking.html         New booking form
table.html            Manage bookings: search, filter, sort, edit, archive, export

css/styles.css        All styling (design tokens + components)

js/config.js           Your Apps Script URL + API key go here
js/api.js               All fetch() calls to the backend live here
js/ui.js                 Toasts, confirm dialogs, skeletons, formatting helpers
js/app.js               Shared shell logic (nav, sidebar toggle)
js/booking.js           Booking form logic
js/table.js              Booking management page logic

backend/Code.gs        Google Apps Script — turns your Sheet into a JSON API
```

## Why Apps Script sits in front of the Sheet

The Google Sheets REST API can read a public sheet with just an API key, but **writing** to a sheet requires OAuth sign-in — not practical for a shared front-desk tool. The standard, well-supported workaround is to deploy a small Google Apps Script as a web app: it runs under your Google account, exposes simple `getBookings` / `createBooking` / `updateBooking` / `archiveBooking` actions, and the front end just calls it with `fetch()`. `backend/Code.gs` is that script — you deploy it once and never touch OAuth.

## Setup (10 minutes)

1. **Create the spreadsheet.** Make a new Google Sheet with three tabs, named exactly:
   - `Bookings` — header row: `Booking ID | Name | Date | Service | Status | Price | Remarks | Created At | Updated At`
   - `Services` — header row: `Service Name | Price | Description | Active`
   - `Archive` — same header row as `Bookings`

   Add a few rows to `Services` (e.g. "Full Detail", 150, "Interior + exterior", TRUE) so the booking form has something to load.

2. **Add the backend script.** In the Sheet, go to **Extensions → Apps Script**. Delete the placeholder code and paste in the contents of `backend/Code.gs`.

3. **Set a secret key.** In `Code.gs`, change:
   ```js
   const API_KEY = 'REPLACE_WITH_A_LONG_RANDOM_SECRET';
   ```
   to any long random string.

4. **Deploy.** Click **Deploy → New deployment**, type **Web app**. Set:
   - Execute as: **Me**
   - Who has access: **Anyone**

   Click Deploy, authorize the permissions prompt, and copy the deployment URL (ends in `/exec`).

5. **Connect the front end.** Open `js/config.js` and fill in:
   ```js
   API_URL: 'https://script.google.com/macros/s/.../exec',
   API_KEY: 'the same secret from step 3',
   ```

6. **Open `index.html`** in a browser (or serve the folder with any static file server — e.g. `npx serve .`). You're live.

> Every time you edit `Code.gs`, you need to **Deploy → Manage deployments → Edit → New version** for changes to take effect — saving alone isn't enough.

## Notes on how each feature works

- **Service dropdown & price autofill** (`booking.html`) — loads active rows from the `Services` sheet on page load; selecting a service fills the Price field, which stays editable.
- **Search & filters** (`table.html`) — search checks name, date, service, status, price, and remarks together; filters (Today / This Week / This Month / status) apply on top of search, not instead of it.
- **Edit** — opens a modal pre-filled with the row's current values; saving calls `updateBooking`, which only changes the fields you touched and stamps `Updated At`.
- **Delete = archive** — nothing is destroyed. The row is copied into `Archive` and removed from `Bookings`, so history is always recoverable by opening the Archive tab.
- **PDF export** — "Export PDF" on the table page respects whatever is currently filtered/searched; the receipt icon on a row builds a one-booking invoice PDF. Both use jsPDF + AutoTable, loaded from CDN in `table.html`.
- **Loading states** — buttons show a spinner and disable themselves during network calls (also blocks duplicate submissions); the table shows shimmering skeleton rows while bookings load.

## Customizing

- Brand name, tagline, currency symbol, and the status list are centralized in `js/config.js`.
- Colors, type, spacing and every component (cards, pills, table, modal, toasts) are defined with CSS variables at the top of `css/styles.css` — change the variables once to reskin the whole app.
