/**
 * ui.js
 * Reusable, presentation-only helpers shared across pages:
 * toasts, confirm dialogs, skeleton loaders, formatting utilities.
 * No Google Sheets / fetch logic belongs in this file.
 */

const UI = (() => {

  // ---------- toasts ----------

  function ensureToastHost() {
    let host = document.getElementById('toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      host.className = 'toast-host';
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(message, type = 'info', duration = 3800) {
    const host = ensureToastHost();
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.innerHTML = `
      <span class="toast__dot"></span>
      <span class="toast__msg">${escapeHtml(message)}</span>
    `;
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast--visible'));

    setTimeout(() => {
      el.classList.remove('toast--visible');
      setTimeout(() => el.remove(), 250);
    }, duration);
  }

  // ---------- confirm dialog ----------

  function confirmDialog({ title, message, confirmLabel = 'Confirm', tone = 'default' }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <h3 id="modal-title" class="modal-card__title">${escapeHtml(title)}</h3>
          <p class="modal-card__body">${escapeHtml(message)}</p>
          <div class="modal-card__actions">
            <button type="button" class="btn btn--ghost" data-action="cancel">Cancel</button>
            <button type="button" class="btn ${tone === 'danger' ? 'btn--danger' : 'btn--primary'}" data-action="confirm">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('modal-overlay--visible'));

      function close(result) {
        overlay.classList.remove('modal-overlay--visible');
        setTimeout(() => overlay.remove(), 200);
        resolve(result);
      }

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
      });
      overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => close(false));
      overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => close(true));
    });
  }

  // ---------- button loading state ----------

  function setButtonLoading(button, isLoading, loadingText = 'Working…') {
    if (!button) return;
    if (isLoading) {
      button.dataset.originalLabel = button.dataset.originalLabel || button.innerHTML;
      button.disabled = true;
      button.classList.add('is-loading');
      button.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${escapeHtml(loadingText)}</span>`;
    } else {
      button.disabled = false;
      button.classList.remove('is-loading');
      if (button.dataset.originalLabel) button.innerHTML = button.dataset.originalLabel;
    }
  }

  // ---------- skeleton rows for tables ----------

  function skeletonRows(columnCount, rowCount = 5) {
    return Array.from({ length: rowCount }).map(() => {
      const cells = Array.from({ length: columnCount })
        .map(() => `<td><span class="skeleton-block"></span></td>`)
        .join('');
      return `<tr class="skeleton-row">${cells}</tr>`;
    }).join('');
  }

  // ---------- formatting ----------

  function formatCurrency(value) {
    const num = Number(value) || 0;
    return `${CONFIG.CURRENCY_SYMBOL}${num.toFixed(2)}`;
  }

  function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  // ---------- time handling ----------
  // Google Sheets can silently reformat a plain "14:30" string into its
  // own time-serial type. To stay robust whether a cell holds plain text
  // or a Sheets-native time value, always normalize through this before
  // displaying or feeding an <input type="time">.

  function normalizeTimeValue(value) {
    if (!value) return '';
    const str = String(value).trim();
    const simple = str.match(/^(\d{1,2}):(\d{2})/);
    if (simple) {
      return `${simple[1].padStart(2, '0')}:${simple[2]}`;
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return '';
  }

  function formatTime(value) {
    const hhmm = normalizeTimeValue(value);
    if (!hhmm) return '—';
    const [h, m] = hhmm.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function statusPillHtml(status) {
    const cls = 'pill pill--' + String(status || 'pending').toLowerCase();
    return `<span class="${cls}"><span class="pill__dot"></span>${escapeHtml(status || 'Pending')}</span>`;
  }

  // ---------- shared booking form validation ----------
  // Used by both the new-booking form (booking.js) and the edit modal
  // (table.js) so the two stay identical instead of drifting apart.

  function validateBookingFields(formEl) {
    const errors = [];
    const required = [
      ['name', 'Customer name is required.'],
      ['date', 'Booking date is required.'],
      ['time', 'Booking time is required.'],
      ['mobile', 'Mobile number is required.'],
      ['vehicleSize', 'Please select a vehicle size.'],
      ['status', 'Please select a status.'],
      ['price', 'Price is required.']
    ];
    required.forEach(([field, message]) => {
      const input = formEl[field];
      if (input && !input.value.trim()) errors.push({ field, message });
    });
    if (formEl.price && formEl.price.value && parseFloat(formEl.price.value) < 0) {
      errors.push({ field: 'price', message: 'Price cannot be negative.' });
    }

    const checklist = formEl.querySelector('[data-service-checklist]');
    if (checklist && !checklist.querySelector('input[type="checkbox"]:checked')) {
      errors.push({ field: 'services', message: 'Select at least one service.' });
    }

    return errors;
  }

  function renderFieldErrors(formEl, errors) {
    formEl.querySelectorAll('.field-error').forEach((el) => (el.textContent = ''));
    formEl.querySelectorAll('.field--invalid').forEach((el) => el.classList.remove('field--invalid'));

    errors.forEach(({ field, message }) => {
      const input = field === 'services'
        ? formEl.querySelector('[data-service-checklist]')
        : formEl[field];
      const wrapper = input?.closest('.field');
      wrapper?.classList.add('field--invalid');
      const errorEl = wrapper?.querySelector('.field-error');
      if (errorEl) errorEl.textContent = message;
    });
  }

  // ---------- service checklist search filter ----------
  // Shared by booking.js and table.js's edit modal. Hides/shows
  // .service-picker__item rows by name match — checked state and
  // validation are unaffected since hidden items stay in the DOM,
  // just visually hidden.

  function filterServiceChecklist(pickerEl, term) {
    if (!pickerEl) return;
    const normalized = (term || '').trim().toLowerCase();
    let anyVisible = false;

    pickerEl.querySelectorAll('.service-picker__item').forEach((item) => {
      const name = (item.querySelector('.service-picker__name')?.textContent || '').toLowerCase();
      const match = !normalized || name.includes(normalized);
      item.style.display = match ? '' : 'none';
      if (match) anyVisible = true;
    });

    let noMatch = pickerEl.querySelector('.service-picker__no-match');
    if (!anyVisible && normalized) {
      if (!noMatch) {
        noMatch = document.createElement('p');
        noMatch.className = 'service-picker__empty service-picker__no-match';
        pickerEl.appendChild(noMatch);
      }
      noMatch.textContent = `No services match "${term.trim()}".`;
    } else if (noMatch) {
      noMatch.remove();
    }
  }

  return {
    toast,
    confirmDialog,
    setButtonLoading,
    skeletonRows,
    formatCurrency,
    formatDate,
    normalizeTimeValue,
    formatTime,
    escapeHtml,
    statusPillHtml,
    validateBookingFields,
    renderFieldErrors,
    filterServiceChecklist
  };
})();
