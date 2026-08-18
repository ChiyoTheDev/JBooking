# John & Jans Auto Detailing — Booking Management System

A booking system built with HTML5, custom CSS, vanilla JavaScript, and a Google Sheet as the database.

## ⚠️ You have existing data — read this before touching the sheet

This update adds new columns and a new way of pricing services. To protect your existing bookings, every new column is **appended to the end** of your current sheets — nothing existing gets moved or reordered. Follow the steps below in order.

### 1. Update the `Bookings` sheet

Your current columns (A–I) stay exactly as they are. Add these five new headers starting in **column J**:

| J | K | L | M | N |
|---|---|---|---|---|
| Time | Mobile No. | Vehicle | Vehicle Size | Plate Number |

**Important — format column J (Time) as Plain Text**: select column J → *Format → Number → Plain text*. Google Sheets will otherwise try to "helpfully" convert times you type into its own time format, which can shift by a few hours depending on timezone handling. Plain text keeps it exactly as entered (e.g. `14:30`).

### 2. Update the `Archive` sheet

Same five columns, same order, also starting at column J. (Archive always mirrors Bookings.)

### 3. Update the `Services` sheet

Your current columns (A–D: Service Name, Price, Description, Active) stay as they are — column B (`Price`) is no longer used by the app, but leave it there so nothing shifts. Add seven new headers starting at **column E**, matching your rate card exactly:

| E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|
| Small | Medium | Large | XL | XXL | Pick Up | Dirty Trail Car |

Then fill in a price for every service at every size. Using your rate card as the example for the first row:

| Service Name | Price | Description | Active | Small | Medium | Large | XL | XXL | Pick Up | Dirty Trail Car |
|---|---|---|---|---|---|---|---|---|---|---|
| Elite Carwash | | 3-bucket wash, interior vacuum... | TRUE | 400 | 500 | 600 | 650 | 700 | 900 | 1500 |

Repeat for each service on your rate card (Interior Light Detailing, Interior Detailing, Additional Carpet Removal, Glass Detailing Acid Rain Removal, Additional Glass Coating, Pet Hair Removal Interior). Leave any size blank for a service that isn't offered at that size — it'll show as "N/A" on the booking form and won't add anything to the total when that size is selected.

### 4. Replace the Apps Script

In **Extensions → Apps Script**, replace everything with the new `backend/Code.gs` from this download, then **Deploy → Manage deployments → (pencil icon) → Version: New version → Deploy**. The deployment URL stays the same, so `js/config.js` doesn't need to change.

### 5. Existing "Ongoing" bookings

The Ongoing status has been removed going forward — it won't appear as an option anymore. Any bookings already marked Ongoing in your sheet will still display fine, they just can't be re-selected. Worth a quick manual pass to move any current Ongoing rows to Pending or Completed.

---

## What's inside

```
index.html            Dashboard / landing page
booking.html           New booking form
table.html              Manage bookings: search, filter, sort, edit, archive, export

css/styles.css          All styling (design tokens + components)

js/config.js             Brand info, Apps Script URL/key, statuses, vehicle sizes
js/api.js                 All fetch() calls to the backend live here
js/ui.js                   Toasts, dialogs, skeletons, formatting/validation helpers
js/services.js             Loads + caches the Services sheet; builds the price checklist
js/sync.js                 Same-device tab-to-tab live updates
js/app.js                 Shared shell logic (nav, sidebar toggle)
js/booking.js             Booking form logic
js/table.js                Booking management page logic

backend/Code.gs         Google Apps Script — turns your Sheet into a JSON API
```

## How the new pricing works

- Each service now has a **price per vehicle size** instead of one flat price (`js/services.js` reads the Small/Medium/.../Dirty Trail Car columns from the Services sheet).
- A booking can include **multiple services** — they're shown as checkboxes, each labeled with its price at whatever vehicle size is currently selected.
- The **Total price** field sums the checked services automatically whenever you change the vehicle size or check/uncheck a service. It's still a normal editable field afterward, so you can manually adjust for a discount or special case — just note that changing the size or service selection again will recalculate and overwrite it.
- In the sheet, a booking's `Service` column stores the chosen services as a comma-separated list (e.g. `Elite Carwash, Pet Hair Removal Interior`).

## Notes on how everything else works

- **Search** (`table.html`) checks name, date, service, status, price, remarks, vehicle, plate number, mobile number, and vehicle size together; filters (Today / This Week / This Month / status) apply on top of search, not instead of it.
- **Edit** opens a modal pre-filled with the row's current values — including re-checking whichever services were originally selected; saving calls `updateBooking`, which only changes the fields you touched and stamps `Updated At`.
- **Delete = archive.** Nothing is destroyed — the row is copied into `Archive` and removed from `Bookings`.
- **PDF export** — "Export PDF" on the table page respects whatever is currently filtered/searched (landscape, to fit the extra columns); the receipt icon on a row builds a one-booking invoice PDF with the customer's vehicle/contact details included.
- **Cross-device sync** — the table page quietly checks for changes made from other devices every 20 seconds (tunable via `CONFIG.POLL_INTERVAL_MS`); same-device tabs (e.g. the booking form and the table open side by side) update instantly via `BroadcastChannel`.

## Customizing

- Brand name, tagline, currency symbol, status list, and vehicle sizes are centralized in `js/config.js`.
- Colors, type, spacing and every component are defined with CSS variables at the top of `css/styles.css`.
