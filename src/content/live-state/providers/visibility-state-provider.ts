/**
 * VisibilityStateProvider — collects live state for DOM visibility context.
 *
 * Detects overlays (cookie banners, popups blocking content) and
 * loading indicators (spinners, skeleton screens).
 */

import type { IStateProvider, VisibilityLiveState } from '../../../types/live-state.types';

const OVERLAY_SELECTORS = [
  // Cookie/consent banners
  '[class*="cookie" i][class*="banner" i]',
  '[class*="cookie" i][class*="consent" i]',
  '[class*="consent" i][class*="banner" i]',
  '[id*="cookie" i][id*="banner" i]',
  '[id*="cookie" i][id*="consent" i]',
  '[id*="consent" i][id*="banner" i]',
  '[id*="consent" i][id*="popup" i]',
  '[id*="consent" i][id*="modal" i]',
  // Generic overlays / popups
  '[class*="overlay" i]:not([aria-hidden="true"])',
  '[class*="popup" i]:not([aria-hidden="true"]):not([style*="display: none"])',
  '[class*="lightbox" i]:not([aria-hidden="true"])',
  // GDPR / privacy
  '[class*="gdpr" i]',
  '[class*="privacy" i][class*="banner" i]',
];

const LOADING_SELECTORS = [
  // Spinners
  '[class*="spinner" i]',
  '[class~="loading" i]',
  '.is-loading',
  '[aria-busy="true"]',
  '[role="progressbar"]',
  // Skeleton screens
  '[class*="skeleton" i]',
  '[class*="shimmer" i]',
  '[class*="placeholder" i][class*="loading" i]',
];

/** Truncate a string to a maximum length */
function truncate(value: string, max = 80): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Check whether an element is visible in the viewport */
function isVisibleInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const computed = window.getComputedStyle(el);
  if (computed.display === 'none' || computed.visibility === 'hidden') return false;
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

/** Extract a human-readable label from an overlay element */
function extractOverlayLabel(el: Element): string {
  const ariaLabel = el.getAttribute('aria-label')?.trim();
  if (ariaLabel) return truncate(ariaLabel);

  const heading = el.querySelector('h1, h2, h3, h4, h5');
  if (heading?.textContent?.trim()) return truncate(heading.textContent.trim());

  const id = el.id;
  if (id) return truncate(id);

  const cls = el.className;
  if (typeof cls === 'string' && cls.trim()) {
    return truncate(cls.trim().split(/\s+/).slice(0, 3).join(' '));
  }

  return 'unknown overlay';
}

export class VisibilityStateProvider implements IStateProvider<VisibilityLiveState> {
  readonly category = 'visibility' as const;

  collect(root: Document | Element): VisibilityLiveState {
    // Detect visible overlays
    const overlays: string[] = [];
    const seen = new Set<Element>();

    for (const selector of OVERLAY_SELECTORS) {
      try {
        const elements = root.querySelectorAll(selector);
        for (const el of elements) {
          if (seen.has(el)) continue;
          seen.add(el);
          if (isVisibleInViewport(el)) {
            overlays.push(extractOverlayLabel(el));
          }
        }
      } catch {
        // Invalid selector in this DOM — skip
      }
    }

    // Detect loading indicators
    let loadingIndicators = false;
    for (const selector of LOADING_SELECTORS) {
      try {
        const elements = root.querySelectorAll(selector);
        for (const el of elements) {
          if (isVisibleInViewport(el)) {
            loadingIndicators = true;
            break;
          }
        }
      } catch {
        // Skip
      }
      if (loadingIndicators) break;
    }

    return {
      overlays: overlays.slice(0, 5),
      loadingIndicators,
    };
  }

  dispose(): void {
    /* no-op */
  }
}
