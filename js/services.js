/**
 * services.js
 * Single source of truth for loading + caching the Services sheet, used by
 * both the new-booking form (booking.js) and the edit modal (table.js).
 *
 * Each service now has a price PER VEHICLE SIZE (Small/Medium/Large/XL/
 * XXL/Pick Up/Dirty Trail Car — see CONFIG.VEHICLE_SIZES) instead of one
 * flat price, and a booking can include more than one service. This
 * module provides the price lookups and the checkbox-list UI both pages
 * use for picking services.
 */

const Services = (() => {
  const CACHE_KEY = 'ld_services_cache_v2';

  function readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.list) ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeCache(list) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ list, cachedAt: Date.now() }));
    } catch {
      // storage unavailable/full — caching is an optimization, not required
    }
  }

  /** Synchronous — returns the cached list immediately, or null if there isn't one yet. */
  function getCached() {
    const cached = readCache();
    return cached ? cached.list : null;
  }

  /**
   * Stale-while-revalidate load. If `onCached` is given, it's called
   * immediately with the cached list (if any) so the caller can render
   * right away. Resolves with the freshest list available: a fresh fetch
   * if it succeeds, otherwise the cache, otherwise it throws.
   */
  async function load(onCached) {
    const cached = readCache();
    if (cached) {
      onCached?.(cached.list);
      if (Date.now() - cached.cachedAt < CONFIG.SERVICES_CACHE_TTL_MS) {
        return cached.list;
      }
    }
    try {
      const fresh = await Api.getServices();
      writeCache(fresh);
      return fresh;
    } catch (err) {
      if (cached) return cached.list; // fall back silently to what we already had
      throw err;
    }
  }

  /** A service's price for a given vehicle size (0 if missing/unset). */
  function priceFor(service, sizeKey) {
    if (!service || !sizeKey) return 0;
    return Number(service[sizeKey]) || 0;
  }

  /** Sum of the given services' prices at the given vehicle size. */
  function computeTotal(list, sizeKey, selectedNames) {
    if (!list || !sizeKey || !selectedNames?.length) return 0;
    return list
      .filter((s) => selectedNames.includes(s['Service Name']))
      .reduce((sum, s) => sum + priceFor(s, sizeKey), 0);
  }

  /**
   * Builds the checkbox-list markup for choosing one or more services.
   * Each row shows the service name and its price at `sizeKey` ('—'
   * until a vehicle size has been chosen, 'N/A' if that service has no
   * price set for the chosen size).
   * - list === null → still loading
   * - list === []   → no active services found
   */
  function checklistHtml(list, { sizeKey = '', selectedNames = [] } = {}) {
    if (!list) {
      return `<p class="service-picker__empty">Loading services…</p>`;
    }
    if (!list.length) {
      return `<p class="service-picker__empty">No active services found in the sheet.</p>`;
    }
    return list.map((s, i) => {
      const name = s['Service Name'];
      const checked = selectedNames.includes(name) ? 'checked' : '';
      const raw = sizeKey ? s[sizeKey] : undefined;
      const hasPrice = raw !== undefined && raw !== null && String(raw).trim() !== '';
      const priceLabel = !sizeKey ? '—' : (hasPrice ? UI.formatCurrency(priceFor(s, sizeKey)) : 'N/A');
      const id = `svc-${i}-${String(name).replace(/[^a-zA-Z0-9]/g, '')}`;
      return `
        <label class="service-picker__item" for="${id}">
          <input type="checkbox" id="${id}" value="${UI.escapeHtml(name)}" ${checked} />
          <span class="service-picker__name">${UI.escapeHtml(name)}</span>
          <span class="service-picker__price mono">${priceLabel}</span>
        </label>`;
    }).join('');
  }

  return { getCached, load, priceFor, computeTotal, checklistHtml };
})();
