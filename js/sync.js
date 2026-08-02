/**
 * sync.js
 * Lets tabs on the SAME device/browser notify each other instantly when a
 * booking is created, updated, or archived — e.g. a front-desk computer
 * with the booking form open in one tab and the management table in
 * another. This does NOT reach other devices; that's handled separately
 * by polling in table.js. Falls back to a harmless no-op if the browser
 * doesn't support BroadcastChannel.
 */

const Sync = (() => {
  const channel = ('BroadcastChannel' in window)
    ? new BroadcastChannel(CONFIG.SYNC_CHANNEL_NAME)
    : null;

  function broadcast(type, payload) {
    channel?.postMessage({ type, payload, at: Date.now() });
  }

  function subscribe(handler) {
    if (!channel) return () => {};
    const listener = (event) => handler(event.data);
    channel.addEventListener('message', listener);
    return () => channel.removeEventListener('message', listener);
  }

  return { broadcast, subscribe };
})();
