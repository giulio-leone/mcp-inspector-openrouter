/**
 * Human-readable live state formatter for AI system prompts.
 *
 * Pure function that converts a LiveStateSnapshot into a compact,
 * emoji-annotated string optimised for AI token budgets.
 */

import type {
  LiveStateSnapshot,
  MediaLiveState,
  FormLiveState,
  NavigationLiveState,
  AuthLiveState,
  InteractiveLiveState,
  VisibilityLiveState,
} from '../types/live-state.types';

/** Format seconds as mm:ss */
function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatMedia(media: readonly MediaLiveState[]): string | null {
  if (!media.length) return null;
  const lines = media.map((m) => {
    const status = m.paused ? '⏸️ PAUSED' : '▶️ PLAYING';
    const time = `${fmtTime(m.currentTime)}/${fmtTime(m.duration)}`;
    const pct = m.duration > 0 ? ` (${Math.round((m.currentTime / m.duration) * 100)}%)` : '';
    const vol = `volume ${Math.round(m.volume * 100)}%`;
    const muted = m.muted ? ', 🔇 MUTED' : '';
    const fullscreen = m.fullscreen ? ', 📺 FULLSCREEN' : '';
    const captions = m.captions ? ', 💬 CAPTIONS ON' : '';
    const speed = m.playbackRate !== 1 ? `, speed ${m.playbackRate}x` : '';
    return `  - "${m.title}" (${m.platform}): ${status} at ${time}${pct}, ${vol}${muted}${fullscreen}${captions}${speed}`;
  });
  return `🎬 Media Players:\n${lines.join('\n')}`;
}

/** Truncate a value string for display */
function truncateValue(v: string, max = 50): string {
  return v.length > max ? v.slice(0, max) + '…' : v;
}

function formatForms(forms: readonly FormLiveState[]): string | null {
  if (!forms.length) return null;
  const lines: string[] = [];
  for (const f of forms) {
    const pct = `${f.filledFields}/${f.totalFields} filled (${f.completionPercent}%)`;
    const dirty = f.dirtyFields.length ? `, dirty: [${f.dirtyFields.join(', ')}]` : '';
    const errors = f.hasValidationErrors ? ', ⚠️ has validation errors' : '';
    lines.push(`  - "${f.toolName || f.formId}": ${pct}${dirty}${errors}`);

    if (f.fields?.length) {
      for (const field of f.fields.slice(0, 15)) {
        const status = field.filled ? '✅' : (field.required ? '❌ REQUIRED' : '⬜');
        const val = field.filled ? ` = "${truncateValue(field.value)}"` : '';
        const opts = field.options?.length ? ` [options: ${field.options.slice(0, 5).join(', ')}]` : '';
        lines.push(`    • ${field.label || field.name} (${field.type}): ${status}${val}${opts}`);
      }
    }
  }
  return `📝 Forms:\n${lines.join('\n')}`;
}

function formatNavigation(nav: NavigationLiveState): string | null {
  if (!nav.currentUrl) return null;
  const parts: string[] = [`  - URL: ${nav.currentUrl}`];
  const detail: string[] = [];
  detail.push(`Scroll: ${nav.scrollPercent}%`);
  if (nav.visibleSection) detail.push(`Section: "${nav.visibleSection}"`);
  if (nav.activeTab) detail.push(`Tab: "${nav.activeTab}"`);
  if (detail.length) parts.push(`  - ${detail.join(' | ')}`);
  if (nav.breadcrumb?.length) parts.push(`  - Breadcrumb: ${nav.breadcrumb.join(' > ')}`);
  return `🧭 Navigation:\n${parts.join('\n')}`;
}

function formatAuth(auth: AuthLiveState): string | null {
  if (!auth.isLoggedIn && !auth.hasLoginForm && !auth.hasLogoutButton) return null;
  if (auth.isLoggedIn) {
    const user = auth.userName ? ` as "${auth.userName}"` : '';
    const logout = auth.hasLogoutButton ? ' | Logout available' : '';
    return `🔐 Auth: ✅ Logged in${user}${logout}`;
  }
  const login = auth.hasLoginForm ? 'Login form available' : 'Not logged in';
  return `🔐 Auth: ${login}`;
}

function formatInteractive(inter: InteractiveLiveState): string | null {
  const parts: string[] = [];
  if (inter.openModals.length) parts.push(`Open modals: ${inter.openModals.map((m) => `"${m}"`).join(', ')}`);
  if (inter.expandedAccordions.length) parts.push(`Expanded: ${inter.expandedAccordions.map((a) => `"${a}"`).join(', ')}`);
  if (inter.openDropdowns.length) parts.push(`Open dropdowns: ${inter.openDropdowns.map((d) => `"${d}"`).join(', ')}`);
  if (inter.visibleNotifications.length) parts.push(`Notifications: ${inter.visibleNotifications.map((n) => `"${n}"`).join(', ')}`);
  if (!parts.length) return null;
  return `🎛️ Interactive:\n${parts.map((p) => `  - ${p}`).join('\n')}`;
}

function formatVisibility(vis: VisibilityLiveState): string | null {
  const parts: string[] = [];
  if (vis.overlays.length) parts.push(`Overlays blocking content: ${vis.overlays.map((o) => `"${o}"`).join(', ')}`);
  if (vis.loadingIndicators) parts.push('⏳ Page is loading (spinners/skeleton screens detected)');
  if (!parts.length) return null;
  return `👁️ Visibility:\n${parts.map((p) => `  - ${p}`).join('\n')}`;
}

/** Convert a LiveStateSnapshot into a compact, human-readable prompt block. */
export function formatLiveStateForPrompt(snapshot: LiveStateSnapshot): string {
  const sections: string[] = [
    formatMedia(snapshot.media),
    formatForms(snapshot.forms),
    formatNavigation(snapshot.navigation),
    formatAuth(snapshot.auth),
    formatInteractive(snapshot.interactive),
    formatVisibility(snapshot.visibility),
  ].filter((s): s is string => s !== null);

  if (!sections.length) return '';
  return `**LIVE PAGE STATE (real-time):**\n\n${sections.join('\n\n')}`;
}
