/**
 * SPA navigation detection — patches History API and listens for
 * popstate events so the extension re-scans on client-side navigations.
 */

import { SPA_NAVIGATION_DEBOUNCE_MS } from '../utils/constants';

export function initSpaDetection(callback: () => void): void {
  let lastSpaUrl = location.href;
  let spaDebounce: ReturnType<typeof setTimeout> | null = null;

  function onSpaNavigation(): void {
    if (location.href === lastSpaUrl) return;
    lastSpaUrl = location.href;
    if (spaDebounce) clearTimeout(spaDebounce);
    spaDebounce = setTimeout(() => {
      console.debug('[WebMCP] SPA navigation detected →', location.href);
      callback();
    }, SPA_NAVIGATION_DEBOUNCE_MS);
  }

  // Safely patch pushState/replaceState — guard against pages that override these
  try {
    const origPushState = history.pushState.bind(history);
    history.pushState = function (...args: Parameters<typeof history.pushState>): void {
      origPushState(...args);
      onSpaNavigation();
    };

    const origReplaceState = history.replaceState.bind(history);
    history.replaceState = function (
      ...args: Parameters<typeof history.replaceState>
    ): void {
      origReplaceState(...args);
      onSpaNavigation();
    };
  } catch (e) {
    console.warn('[WebMCP] Could not patch history API:', e);
  }

  window.addEventListener('popstate', onSpaNavigation);
}
