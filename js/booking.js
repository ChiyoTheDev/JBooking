/**
 * booking.js
 * Logic for the booking entry page (booking.html).
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('booking-form');
  if (!form) return;

  const vehicleSizeSelect = document.getElementById('field-vehicle-size');
  const servicePicker = document.getElementById('service-picker');
  const serviceSearchInput = document.getElementById('service-search');
  const priceInput = document.getElementById('field-price');
  const dateInput = document.getElementById('field-date');
  const submitBtn = document.getElementById('booking-submit');

  let servicesList = null; // null = not loaded yet
  let isSubmitting = false;

  init();

  async function init() {
    setDefaultDate();
    populateVehicleSizes();
    await loadServices();
  }

  function setDefaultDate() {
    if (!dateInput.value) {
      dateInput.value = new Date().toISOString().slice(0, 10);
    }
  }

  function populateVehicleSizes() {
    const options = CONFIG.VEHICLE_SIZES.map((size) => `<option value="${size}">${size}</option>`).join('');
    vehicleSizeSelect.innerHTML = `<option value="">Select a size…</option>${options}`;
  }

  // ---------- services ----------

  async function loadServices() {
    // Stale-while-revalidate via the shared Services module: render the
    // cached list immediately if we have one, then quietly refresh.
    const cached = Services.getCached();
    if (cached) {
      servicesList = cached;
      renderServicePicker();
    }
    try {
      servicesList = await Services.load();
      renderServicePicker();
    } catch (err) {
      if (!cached) {
        servicePicker.innerHTML = `<p class="service-picker__empty">Couldn't load services.</p>`;
        UI.toast(err.message || 'Could not load services from the sheet.', 'error');
      }
    }
  }

  function getSelectedServiceNames() {
    return Array.from(servicePicker.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);
  }

  function renderServicePicker() {
    const selected = getSelectedServiceNames();
    servicePicker.innerHTML = Services.checklistHtml(servicesList, {
      sizeKey: vehicleSizeSelect.value,
      selectedNames: selected
    });
    UI.filterServiceChecklist(servicePicker, serviceSearchInput.value);
    recalculateTotal();
  }

  function recalculateTotal() {
    if (!servicesList || !vehicleSizeSelect.value) return;
    const selected = getSelectedServiceNames();
    const total = Services.computeTotal(servicesList, vehicleSizeSelect.value, selected);
    priceInput.value = total.toFixed(2);
  }

  vehicleSizeSelect.addEventListener('change', renderServicePicker);

  servicePicker.addEventListener('change', (e) => {
    if (e.target.matches('input[type="checkbox"]')) recalculateTotal();
  });

  serviceSearchInput.addEventListener('input', () => {
    UI.filterServiceChecklist(servicePicker, serviceSearchInput.value);
  });

  // ---------- submit ----------

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
      mobile: form.mobile.value.trim(),
      date: form.date.value,
      time: form.time.value,
      vehicle: form.vehicle.value.trim(),
      plateNumber: form.plateNumber.value.trim(),
      vehicleSize: form.vehicleSize.value,
      service: getSelectedServiceNames().join(', '),
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
      serviceSearchInput.value = '';
      renderServicePicker(); // clears checkboxes + price, shows "select a size" state
    } catch (err) {
      UI.toast(err.message || 'Could not save this booking. Please try again.', 'error');
    } finally {
      isSubmitting = false;
      UI.setButtonLoading(submitBtn, false);
    }
  });
});
