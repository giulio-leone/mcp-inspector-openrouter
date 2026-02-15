import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VisibilityStateProvider } from '../visibility-state-provider';

function makeDoc(html: string): Document {
  const doc = document.implementation.createHTMLDocument('test');
  doc.body.innerHTML = html;
  // jsdom returns zero-sized rects; stub getBoundingClientRect for visibility checks
  doc.body.querySelectorAll('*').forEach((el) => {
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      top: 0, bottom: 100, left: 0, right: 100,
      width: 100, height: 100, x: 0, y: 0, toJSON: () => {},
    });
  });
  return doc;
}

describe('VisibilityStateProvider', () => {
  let provider: VisibilityStateProvider;

  beforeEach(() => {
    provider = new VisibilityStateProvider();
  });

  it('returns empty state for a clean page', () => {
    const doc = makeDoc('<p>Hello world</p>');
    const result = provider.collect(doc);
    expect(result.overlays).toEqual([]);
    expect(result.loadingIndicators).toBe(false);
  });

  it('detects cookie consent banners', () => {
    const doc = makeDoc(`
      <div class="cookie-consent" aria-label="Cookie Settings">
        <p>We use cookies</p>
        <button>Accept</button>
      </div>
    `);
    const result = provider.collect(doc);
    expect(result.overlays.length).toBeGreaterThan(0);
  });

  it('detects overlay elements', () => {
    const doc = makeDoc(`
      <div class="overlay" aria-label="Promotional Overlay">
        <h2>Subscribe!</h2>
      </div>
    `);
    const result = provider.collect(doc);
    expect(result.overlays.length).toBeGreaterThan(0);
  });

  it('detects loading spinners', () => {
    const doc = makeDoc(`
      <div class="spinner">Loading...</div>
    `);
    const result = provider.collect(doc);
    expect(result.loadingIndicators).toBe(true);
  });

  it('detects skeleton screens', () => {
    const doc = makeDoc(`
      <div class="skeleton-card">
        <div class="skeleton-line"></div>
      </div>
    `);
    const result = provider.collect(doc);
    expect(result.loadingIndicators).toBe(true);
  });

  it('detects progressbar role', () => {
    const doc = makeDoc(`
      <div role="progressbar" aria-valuenow="50" aria-valuemin="0" aria-valuemax="100">Loading</div>
    `);
    const result = provider.collect(doc);
    expect(result.loadingIndicators).toBe(true);
  });

  it('limits overlays to 5', () => {
    const overlays = Array.from({ length: 8 }, (_, i) =>
      `<div class="overlay" id="overlay-${i}">Overlay ${i}</div>`,
    ).join('');
    const doc = makeDoc(overlays);
    const result = provider.collect(doc);
    expect(result.overlays.length).toBeLessThanOrEqual(5);
  });

  it('uses aria-label for overlay label', () => {
    const doc = makeDoc(`
      <div class="cookie-banner" aria-label="GDPR Consent">Accept cookies</div>
    `);
    const result = provider.collect(doc);
    expect(result.overlays.some(o => o.includes('GDPR Consent'))).toBe(true);
  });

  it('category is visibility', () => {
    expect(provider.category).toBe('visibility');
  });

  it('dispose is a no-op', () => {
    expect(() => provider.dispose()).not.toThrow();
  });
});
