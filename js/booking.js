/**
 * booking.js
 * Logic for the booking entry page (booking.html).
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('booking-form');
  if (!form) return;

  const serviceSelect = document.getElementById('field-service');
  const priceInput = document.getElementById('field-price');
  const dateInput = document.getElementById('field-date');
  const submitBtn = document.getElementById('booking-submit');

  let services = [];
  let isSubmitting = false;

  init();

  async function init() {
    setDefaultDate();
    await loadServices();
  }

  function setDefaultDate() {
    if (!dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
  }

  async function loadServices() {
    // Stale-while-revalidate via the shared Services module: if we have a
    // recent cached list, render it immediately (no spinner, no wait)
    // while it quietly refreshes in the background if stale. This is
    // what makes entering several bookings back-to-back feel instant
    // instead of re-hitting the sheet's Services tab every time.
    const cached = Services.getCached();
    if (cached) {
      renderServiceOptions(cached);
    } else {
      serviceSelect.disabled = true;
      serviceSelect.innerHTML = Services.optionsHtml(null);
    }

    try {
      const fresh = await Services.load();
      renderServiceOptions(fresh);
    } catch (err) {
      if (!cached) {
        serviceSelect.innerHTML = `<option value="">Couldn't load services</option>`;
        UI.toast(err.message || 'Could not load services from the sheet.', 'error');
      }
      // if a cached list was already on screen, fail silently — the
      // form is still fully usable with what's showing.
    } finally {
      serviceSelect.disabled = false;
    }
  }

  function renderServiceOptions(list) {
    services = list;
    const previouslySelected = serviceSelect.value;
    serviceSelect.innerHTML = Services.optionsHtml(list, { selected: '', includeBlank: true });
    if (previouslySelected) serviceSelect.value = previouslySelected;
  }

  serviceSelect.addEventListener('change', () => {
    const selected = serviceSelect.selectedOptions[0];
    const price = selected?.dataset.price;
    if (price !== undefined && price !== '') {
      priceInput.value = Number(price).toFixed(2);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const errors = UI.validateBookingFields(form);
    UI.renderFieldErrors(form, errors);
    if (errors.length) {
      UI.toast('Please fix the highlighted fields.', 'error');
      return;
    }

    const payload = {
      name: form.name.value.trim(),
      date: form.date.value,
      service: form.service.value,
      status: form.status.value,
      price: parseFloat(form.price.value) || 0,
      remarks: form.remarks.value.trim()
    };

    isSubmitting = true;
    UI.setButtonLoading(submitBtn, true, 'Saving…');
    try {
      const created = await Api.createBooking(payload);
      Sync.broadcast('booking-created', created);
      UI.toast('Booking saved successfully.', 'success');
      form.reset();
      setDefaultDate();
      form.status.value = 'Pending';
    } catch (err) {
      UI.toast(err.message || 'Could not save this booking. Please try again.', 'error');
    } finally {
      isSubmitting = false;
      UI.setButtonLoading(submitBtn, false);
    }
  });

});
