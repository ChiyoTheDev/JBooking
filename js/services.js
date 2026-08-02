/**
 * services.js
 * Single source of truth for loading + caching the Services sheet, used by
 * both the new-booking form (booking.js) and the edit modal (table.js) so
 * they share one cache and one dropdown-building function instead of two
 * copies that could drift apart.
 */

const Services = (() => {
  const CACHE_KEY = 'ld_services_cache_v1';

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

  /**
   * Builds <option> HTML for a services dropdown.
   * - list === null  → still loading; shows a placeholder (keeps `selected` if given)
   * - list === []    → no services found
   * - selected       → the currently chosen service name (e.g. editing an existing booking)
   * - includeBlank   → whether to show a "Select a service…" first option when nothing is selected
   */
  function optionsHtml(list, { selected = '', includeBlank = true } = {}) {
    if (!list) {
      const label = selected ? UI.escapeHtml(selected) : 'Loading services…';
      return `<option value="${UI.escapeHtml(selected)}" selected>${label}</option>`;
    }
    if (!list.length) {
      return `<option value="">No services found</option>`;
    }

    const parts = [];
    const hasSelected = list.some((s) => s['Service Name'] === selected);

    if (includeBlank && !selected) {
      parts.push(`<option value="">Select a service…</option>`);
    }
    if (selected && !hasSelected) {
      // The booking's current service isn't in the active list anymore
      // (renamed/deactivated) — keep it visible instead of silently dropping it.
      parts.push(`<option value="${UI.escapeHtml(selected)}" selected>${UI.escapeHtml(selected)} (current)</option>`);
    }
    list.forEach((s) => {
      const name = s['Service Name'];
      const price = Number(s['Price']) || 0;
      const isSelected = name === selected;
      parts.push(`<option value="${UI.escapeHtml(name)}" data-price="${price}" ${isSelected ? 'selected' : ''}>${UI.escapeHtml(name)} — ${UI.formatCurrency(price)}</option>`);
    });
    return parts.join('');
  }

  return { getCached, load, optionsHtml };
})();
