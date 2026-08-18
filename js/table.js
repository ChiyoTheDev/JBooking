/**
 * table.js
 * Logic for the booking management page (table.html):
 * summary cards, search + filter, sorting, pagination,
 * edit / archive (soft delete), PDF export, and keeping the
 * table in sync with changes made elsewhere.
 */

document.addEventListener('DOMContentLoaded', () => {
  const tableBody = document.getElementById('bookings-tbody');
  if (!tableBody) return;

  const searchInput = document.getElementById('search-input');
  const filterSelect = document.getElementById('filter-select');
  const pageSizeSelect = document.getElementById('page-size-select');
  const paginationEl = document.getElementById('pagination');
  const refreshBtn = document.getElementById('refresh-btn');
  const exportBtn = document.getElementById('export-pdf-btn');
  const emptyState = document.getElementById('empty-state');
  const sortHeaders = document.querySelectorAll('[data-sort-key]');

  const COLUMN_COUNT = 8; // Name, Date, Vehicle, Plate, Service, Status, Price, Remarks, Actions

  let allBookings = [];
  let filtered = [];
  let currentPage = 1;
  let pageSize = parseInt(pageSizeSelect?.value || '10', 10);
  let sortKey = 'Date';
  let sortDir = 'desc';
  let searchTerm = '';
  let activeFilter = 'all';
  let isModalOpen = false;
  let lastSignature = '';
  let expandedIds = new Set(); // Booking IDs whose detail row is currently open

  init();

  async function init() {
    wireControls();
    wireSync();
    Services.load(); // warm the shared cache in parallel — don't block the table on this
    await loadBookings();
    startBackgroundSync();
  }

  function wireControls() {
    let debounceHandle;
    searchInput?.addEventListener('input', () => {
      clearTimeout(debounceHandle);
      debounceHandle = setTimeout(() => {
        searchTerm = searchInput.value.trim().toLowerCase();
        currentPage = 1;
        applyFiltersAndRender();
      }, 200);
    });

    filterSelect?.addEventListener('change', () => {
      activeFilter = filterSelect.value;
      currentPage = 1;
      applyFiltersAndRender();
    });

    pageSizeSelect?.addEventListener('change', () => {
      pageSize = parseInt(pageSizeSelect.value, 10);
      currentPage = 1;
      applyFiltersAndRender();
    });

    refreshBtn?.addEventListener('click', () => loadBookings());

    exportBtn?.addEventListener('click', async () => {
      if (!filtered.length) {
        UI.toast('There are no bookings to export.', 'info');
        return;
      }
      const confirmed = await UI.confirmDialog({
        title: 'Download PDF?',
        message: `This will export ${filtered.length} booking${filtered.length === 1 ? '' : 's'} matching your current search/filter as a PDF.`,
        confirmLabel: 'Download'
      });
      if (confirmed) exportTableToPdf(filtered);
    });

    sortHeaders.forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.sortKey;
        if (sortKey === key) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = key;
          sortDir = 'asc';
        }
        updateSortIndicators();
        applyFiltersAndRender();
      });
    });
    updateSortIndicators();
  }

  function updateSortIndicators() {
    sortHeaders.forEach((th) => {
      th.classList.toggle('is-sorted', th.dataset.sortKey === sortKey);
      th.dataset.sortDir = th.dataset.sortKey === sortKey ? sortDir : '';
    });
  }

  // ---------- same-device instant sync ----------

  function wireSync() {
    Sync.subscribe((message) => {
      if (!message) return;
      if (message.type === 'booking-created' && message.payload) {
        const exists = allBookings.some((b) => b['Booking ID'] === message.payload['Booking ID']);
        if (!exists) {
          allBookings = [message.payload, ...allBookings];
          lastSignature = computeSignature(allBookings);
          applyFiltersAndRender();
          UI.toast(`New booking synced: ${message.payload['Name']}`, 'info');
        }
      }
    });
  }

  // ---------- background sync (other devices) ----------

  function startBackgroundSync() {
    setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (isModalOpen) return;
      refreshSilently();
    }, CONFIG.POLL_INTERVAL_MS);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !isModalOpen) refreshSilently();
    });
    window.addEventListener('focus', () => {
      if (!isModalOpen) refreshSilently();
    });
  }

  async function refreshSilently() {
    try {
      const fresh = await Api.getBookings();
      const freshSignature = computeSignature(fresh);
      if (freshSignature === lastSignature) return; // nothing changed — skip the re-render entirely

      const isNewBooking = fresh.length > allBookings.length;
      allBookings = fresh;
      lastSignature = freshSignature;
      applyFiltersAndRender();

      if (isNewBooking) UI.toast('Bookings updated from another device.', 'info');
    } catch {
      // silent by design — a failed background check shouldn't interrupt anyone
    }
  }

  function computeSignature(bookings) {
    return bookings
      .map((b) => `${b['Booking ID']}:${b['Status']}:${b['Updated At']}`)
      .sort()
      .join('|');
  }

  // ---------- data loading ----------

  async function loadBookings() {
    tableBody.innerHTML = UI.skeletonRows(COLUMN_COUNT, 6);
    emptyState.hidden = true;
    try {
      allBookings = await Api.getBookings();
      lastSignature = computeSignature(allBookings);
      applyFiltersAndRender();
    } catch (err) {
      tableBody.innerHTML = '';
      UI.toast(err.message || 'Could not load bookings from the sheet.', 'error');
      emptyState.hidden = false;
      emptyState.textContent = "Couldn't load bookings. Check your connection and try refreshing.";
    }
  }

  // ---------- filtering / search / sort ----------

  function applyFiltersAndRender() {
    filtered = allBookings.filter(matchesFilter).filter(matchesSearch);
    filtered.sort(compareRows);
    renderSummary(allBookings);
    renderTablePage();
  }

  function matchesFilter(booking) {
    if (activeFilter === 'all') return true;
    const status = String(booking['Status'] || '').toLowerCase();
    if (['pending', 'completed', 'cancelled'].includes(activeFilter)) {
      return status === activeFilter;
    }
    const date = new Date(booking['Date']);
    if (isNaN(date.getTime())) return false;
    const now = new Date();

    if (activeFilter === 'today') {
      return isSameDay(date, now);
    }
    if (activeFilter === 'week') {
      const start = startOfWeek(now);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return date >= start && date < end;
    }
    if (activeFilter === 'month') {
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    }
    return true;
  }

  function matchesSearch(booking) {
    if (!searchTerm) return true;
    const haystack = [
      booking['Name'], booking['Service'], booking['Status'],
      booking['Price'], booking['Remarks'], booking['Date'],
      booking['Vehicle'], booking['Plate Number'], booking['Mobile No.'], booking['Vehicle Size']
    ].map((v) => String(v ?? '').toLowerCase()).join(' | ');
    return haystack.includes(searchTerm);
  }

  function compareRows(a, b) {
    let va = a[sortKey];
    let vb = b[sortKey];
    if (sortKey === 'Price') {
      va = Number(va) || 0;
      vb = Number(vb) || 0;
    } else if (sortKey === 'Date') {
      va = new Date(va).getTime() || 0;
      vb = new Date(vb).getTime() || 0;
    } else {
      va = String(va ?? '').toLowerCase();
      vb = String(vb ?? '').toLowerCase();
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day; // week starts Monday
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // ---------- summary cards ----------

  function renderSummary(bookings) {
    const counts = { Pending: 0, Completed: 0, Cancelled: 0 };
    bookings.forEach((b) => {
      const status = b['Status'];
      if (counts[status] !== undefined) counts[status]++;
    });
    setText('summary-pending', counts.Pending);
    setText('summary-completed', counts.Completed);
    setText('summary-cancelled', counts.Cancelled);
    setText('summary-total', bookings.length);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // ---------- table rendering + pagination ----------

  function renderTablePage() {
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    const pageItems = filtered.slice(start, start + pageSize);

    emptyState.hidden = filtered.length !== 0;

    tableBody.innerHTML = pageItems.map(rowHtml).join('');
    renderPagination(totalPages);
    wireRowActions();
  }

  function rowHtml(booking) {
  const id = UI.escapeHtml(booking['Booking ID']);
  
  return `
    <tr data-booking-id="${id}">
      <td>
        <div class="cell-group">
          <span class="cell-group__main">${UI.escapeHtml(booking['Name'])}</span>
          <span class="cell-group__sub">${UI.escapeHtml(booking['Mobile No.'] || 'No mobile')}</span>
        </div>
      </td>
      <td>
        <div class="cell-group">
          <span class="cell-group__main">${UI.formatDate(booking['Date'])}</span>
          <span class="cell-group__sub">${UI.formatTime(booking['Time'])}</span>
        </div>
      </td>
      <td>
        <div class="cell-group">
          <span class="cell-group__main">${UI.escapeHtml(booking['Vehicle'] || '—')}</span>
          <span class="cell-group__sub">${UI.escapeHtml(booking['Plate Number'] || '—')}</span>
        </div>
      </td>
      <td>
        <div class="cell-group">
          <span class="cell-group__main">${UI.escapeHtml(booking['Service'] || '—')}</span>
          <span class="cell-group__sub">${UI.escapeHtml(booking['Vehicle Size'] || '—')}</span>
        </div>
      </td>
      <td>${UI.statusPillHtml(booking['Status'])}</td>
      <td class="mono">${UI.formatCurrency(booking['Price'])}</td>
      <td style="max-width: 150px;">${UI.escapeHtml(booking['Remarks'] || '—')}</td>
      <td>
        <button type="button" class="icon-btn" data-action="receipt" title="Download receipt">🧾</button>
        <button type="button" class="icon-btn" data-action="edit" title="Edit booking">✎</button>
        <button type="button" class="icon-btn icon-btn--danger" data-action="delete" title="Delete booking">✕</button>
      </td>
    </tr>
  `;
  }

  function renderPagination(totalPages) {
    if (!paginationEl) return;
    if (totalPages <= 1) {
      paginationEl.innerHTML = '';
      return;
    }
    const buttons = [];
    buttons.push(pageButton('‹', currentPage - 1, currentPage === 1));
    for (let p = 1; p <= totalPages; p++) {
      if (totalPages > 7 && Math.abs(p - currentPage) > 2 && p !== 1 && p !== totalPages) {
        if (p === 2 || p === totalPages - 1) buttons.push('<span class="pagination__ellipsis">…</span>');
        continue;
      }
      buttons.push(pageButton(String(p), p, false, p === currentPage));
    }
    buttons.push(pageButton('›', currentPage + 1, currentPage === totalPages));
    paginationEl.innerHTML = buttons.join('');

    paginationEl.querySelectorAll('[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentPage = parseInt(btn.dataset.page, 10);
        renderTablePage();
      });
    });
  }

  function pageButton(label, page, disabled, active = false) {
    return `<button type="button" class="pagination__btn ${active ? 'pagination__btn--active' : ''}"
      data-page="${page}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  }

  // ---------- row actions ----------

  function wireRowActions() {
    tableBody.querySelectorAll('[data-action]').forEach((btn) => {
      const row = btn.closest('tr');
      const bookingId = row.dataset.bookingId;
      const booking = filtered.find((b) => String(b['Booking ID']) === bookingId);

      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        if (action === 'toggle') toggleDetailRow(bookingId, btn);
        if (action === 'edit') openEditModal(booking);
        if (action === 'delete') handleDelete(booking);
        if (action === 'receipt') {
          const confirmed = await UI.confirmDialog({
            title: 'Download receipt?',
            message: `This will download a PDF receipt for ${booking['Name']}'s booking.`,
            confirmLabel: 'Download'
          });
          if (confirmed) exportReceiptToPdf(booking);
        }
      });
    });
  }

  function toggleDetailRow(bookingId, toggleBtn) {
    const isExpanded = expandedIds.has(bookingId);
    const detailRow = tableBody.querySelector(`tr.row-detail[data-detail-for="${CSS.escape(bookingId)}"]`);

    if (isExpanded) {
      expandedIds.delete(bookingId);
      detailRow?.classList.add('row-detail--hidden');
      toggleBtn.textContent = '▸';
      toggleBtn.setAttribute('aria-expanded', 'false');
      toggleBtn.title = 'Show more details';
      toggleBtn.setAttribute('aria-label', 'Show more details');
    } else {
      expandedIds.add(bookingId);
      detailRow?.classList.remove('row-detail--hidden');
      toggleBtn.textContent = '▾';
      toggleBtn.setAttribute('aria-expanded', 'true');
      toggleBtn.title = 'Hide more details';
      toggleBtn.setAttribute('aria-label', 'Hide more details');
    }
  }

  async function handleDelete(booking) {
    const confirmed = await UI.confirmDialog({
      title: 'Delete this booking?',
      message: `"${booking['Name']}" will be moved to the archive and removed from the active list.`,
      confirmLabel: 'Delete',
      tone: 'danger'
    });
    if (!confirmed) return;

    try {
      await Api.archiveBooking(booking['Booking ID']);
      allBookings = allBookings.filter((b) => b['Booking ID'] !== booking['Booking ID']);
      lastSignature = computeSignature(allBookings);
      applyFiltersAndRender();
      UI.toast('Booking archived.', 'success');
    } catch (err) {
      UI.toast(err.message || 'Could not delete this booking.', 'error');
    }
  }

  // ---------- edit modal ----------

  function openEditModal(booking) {
    isModalOpen = true;

    const currentServices = String(booking['Service'] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const currentSize = booking['Vehicle Size'] || '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-card modal-card--wide" role="dialog" aria-modal="true">
        <h3 class="modal-card__title">Edit booking</h3>
        <form class="edit-form" novalidate>
          <div class="field">
            <label for="edit-name">Customer name</label>
            <input id="edit-name" name="name" type="text" placeholder="e.g. Alex Rivera" value="${UI.escapeHtml(booking['Name'])}" required />
            <span class="field-error"></span>
          </div>
          <div class="field">
            <label for="edit-mobile">Mobile number</label>
            <input id="edit-mobile" name="mobile" type="tel" placeholder="e.g. 0917 123 4567" value="${UI.escapeHtml(booking['Mobile No.'])}" required />
            <span class="field-error"></span>
          </div>
          <div class="field">
            <label for="edit-date">Booking date</label>
            <input id="edit-date" name="date" type="date" value="${formatDateForInput(booking['Date'])}" required />
            <span class="field-error"></span>
          </div>
          <div class="field">
            <label for="edit-time">Booking time</label>
            <input id="edit-time" name="time" type="time" value="${UI.normalizeTimeValue(booking['Time'])}" required />
            <span class="field-error"></span>
          </div>
          <div class="field">
            <label for="edit-vehicle">Vehicle</label>
            <input id="edit-vehicle" name="vehicle" type="text" placeholder="e.g. Toyota Fortuner" value="${UI.escapeHtml(booking['Vehicle'])}" />
            <span class="field-error"></span>
          </div>
          <div class="field">
            <label for="edit-plate">Plate number</label>
            <input id="edit-plate" name="plateNumber" type="text" placeholder="e.g. ABC 1234" value="${UI.escapeHtml(booking['Plate Number'])}" />
            <span class="field-error"></span>
          </div>
          <div class="field">
            <label for="edit-vehicle-size">Vehicle size</label>
            <select id="edit-vehicle-size" name="vehicleSize" required>
              <option value="">Select a size…</option>
              ${CONFIG.VEHICLE_SIZES.map((s) => `<option value="${s}" ${s === currentSize ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
            <span class="field-error"></span>
          </div>
          <div class="field">
            <label for="edit-status">Status</label>
            <select id="edit-status" name="status">
              ${CONFIG.STATUSES.map((s) => `<option value="${s}" ${s === booking['Status'] ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
            <span class="field-error"></span>
          </div>
          <div class="field field--full">
            <label>Services</label>
            <div class="search-box service-picker__search">
              <span class="search-box__icon">⌕</span>
              <input type="text" id="edit-service-search" placeholder="Search services…" autocomplete="off" />
            </div>
            <div class="service-picker" id="edit-service-picker" data-service-checklist>
              ${Services.checklistHtml(Services.getCached(), { sizeKey: currentSize, selectedNames: currentServices })}
            </div>
            <span class="field-error"></span>
          </div>
          <div class="field">
            <label for="edit-price">Total price</label>
            <input id="edit-price" name="price" type="number" step="0.01" min="0" value="${Number(booking['Price']) || 0}" required />
            <span class="field-error"></span>
          </div>
          <div class="field field--full">
            <label for="edit-remarks">Remarks</label>
            <textarea id="edit-remarks" name="remarks" placeholder="Optional notes — condition of vehicle, special requests, etc." rows="2">${UI.escapeHtml(booking['Remarks'])}</textarea>
            <span class="field-error"></span>
          </div>
          <div class="modal-card__actions modal-card__actions--full">
            <button type="button" class="btn btn--ghost" data-action="cancel">Cancel</button>
            <button type="submit" class="btn btn--primary" id="edit-save-btn">Save changes</button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('modal-overlay--visible'));

    const form = overlay.querySelector('.edit-form');
    const sizeSelect = overlay.querySelector('#edit-vehicle-size');
    const servicePicker = overlay.querySelector('#edit-service-picker');
    const serviceSearchInput = overlay.querySelector('#edit-service-search');
    const priceInput = overlay.querySelector('#edit-price');
    let editServicesList = Services.getCached();

    // Apply once for the initial render (in case Services.getCached() was
    // already non-null when the modal opened) — harmless no-op otherwise.
    UI.filterServiceChecklist(servicePicker, serviceSearchInput.value);

    // Refresh with a live services list in the background in case it
    // wasn't cached yet, or prices have changed since it was cached —
    // preserves whatever the user has checked/selected so far.
    Services.load().then((list) => {
      editServicesList = list;
      rerenderServicePicker({ recalc: false });
    }).catch(() => { /* keep whatever is already shown */ });

    function getSelectedServiceNames() {
      return Array.from(servicePicker.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);
    }

    function rerenderServicePicker({ recalc = true } = {}) {
      const selected = getSelectedServiceNames();
      servicePicker.innerHTML = Services.checklistHtml(editServicesList, {
        sizeKey: sizeSelect.value,
        selectedNames: selected
      });
      UI.filterServiceChecklist(servicePicker, serviceSearchInput.value);
      if (recalc) recalculateTotal();
    }

    function recalculateTotal() {
      if (!editServicesList || !sizeSelect.value) return;
      const total = Services.computeTotal(editServicesList, sizeSelect.value, getSelectedServiceNames());
      priceInput.value = total.toFixed(2);
    }

    sizeSelect.addEventListener('change', () => rerenderServicePicker());
    servicePicker.addEventListener('change', (e) => {
      if (e.target.matches('input[type="checkbox"]')) recalculateTotal();
    });
    serviceSearchInput.addEventListener('input', () => {
      UI.filterServiceChecklist(servicePicker, serviceSearchInput.value);
    });

    const close = () => {
      isModalOpen = false;
      overlay.classList.remove('modal-overlay--visible');
      setTimeout(() => overlay.remove(), 200);
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', close);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const errors = UI.validateBookingFields(form);
      UI.renderFieldErrors(form, errors);
      if (errors.length) {
        UI.toast('Please fix the highlighted fields.', 'error');
        return;
      }

      const saveBtn = document.getElementById('edit-save-btn');
      UI.setButtonLoading(saveBtn, true, 'Saving…');
      try {
        const updated = await Api.updateBooking(booking['Booking ID'], {
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
        });
        // Optimistic update: patch the row in place from the response
        // instead of re-fetching the whole sheet.
        allBookings = allBookings.map((b) =>
          b['Booking ID'] === booking['Booking ID'] ? updated : b
        );
        lastSignature = computeSignature(allBookings);
        applyFiltersAndRender();
        UI.toast('Booking updated.', 'success');
        close();
      } catch (err) {
        UI.toast(err.message || 'Could not update this booking.', 'error');
        UI.setButtonLoading(saveBtn, false);
      }
    });
  }

  function formatDateForInput(value) {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  // ---------- PDF export ----------

  function exportTableToPdf(rows) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFontSize(16);
    doc.text(CONFIG.COMPANY_NAME, 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Booking export — ${new Date().toLocaleString()}`, 14, 24);

    doc.autoTable({
      startY: 30,
      head: [['Name', 'Date', 'Time', 'Vehicle', 'Plate No.', 'Service', 'Status', 'Price']],
      body: rows.map((b) => [
        b['Name'], UI.formatDate(b['Date']), UI.formatTime(b['Time']),
        b['Vehicle'] || '', b['Plate Number'] || '', b['Service'], b['Status'],
        UI.formatCurrency(b['Price'])
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [20, 20, 22] }
    });

    doc.save(`bookings-export-${Date.now()}.pdf`);
  }

  function exportReceiptToPdf(booking) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text(CONFIG.COMPANY_NAME, 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(CONFIG.COMPANY_TAGLINE, 14, 28);

    doc.setTextColor(20);
    doc.setFontSize(13);
    doc.text('Service Receipt', 14, 42);
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(`Booking ID: ${booking['Booking ID']}`, 14, 49);
    doc.text(`Date issued: ${new Date().toLocaleDateString()}`, 14, 55);

    doc.autoTable({
      startY: 64,
      head: [['Field', 'Details']],
      body: [
        ['Customer', booking['Name']],
        ['Mobile No.', booking['Mobile No.'] || '—'],
        ['Vehicle', booking['Vehicle'] || '—'],
        ['Plate Number', booking['Plate Number'] || '—'],
        ['Vehicle Size', booking['Vehicle Size'] || '—'],
        ['Booking date', UI.formatDate(booking['Date'])],
        ['Booking time', UI.formatTime(booking['Time'])],
        ['Service(s)', booking['Service']],
        ['Status', booking['Status']],
        ['Remarks', booking['Remarks'] || '—'],
      ],
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [20, 20, 22] }
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text(`Total: ${UI.formatCurrency(booking['Price'])}`, 14, finalY);

    doc.setFontSize(9);
    doc.setTextColor(140);
    doc.text('Thank you for trusting us with your vehicle.', 14, finalY + 12);

    doc.save(`receipt-${booking['Booking ID']}.pdf`);
  }
});
