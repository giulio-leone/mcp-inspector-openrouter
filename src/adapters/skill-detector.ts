/**
 * Skill detector — infers tab capabilities from URL and page title.
 * Used by the orchestrator to auto-register tabs with the delegation adapter.
 */

export interface SkillDetectionResult {
  readonly skills: readonly string[];
  readonly platform: string;
  readonly confidence: number;
}

interface PlatformEntry {
  readonly platform: string;
  readonly skills: readonly string[];
}

const PLATFORM_MAP: ReadonlyMap<string, PlatformEntry> = new Map([
  ['youtube.com', { platform: 'youtube', skills: ['video', 'media', 'playback', 'comments', 'subscribe'] }],
  ['gmail.com', { platform: 'gmail', skills: ['email', 'compose', 'inbox', 'search'] }],
  ['docs.google.com', { platform: 'google-docs', skills: ['document', 'edit', 'format', 'share'] }],
  ['sheets.google.com', { platform: 'google-sheets', skills: ['spreadsheet', 'data', 'formula', 'chart'] }],
  ['slides.google.com', { platform: 'google-slides', skills: ['presentation', 'slides', 'design'] }],
  ['drive.google.com', { platform: 'google-drive', skills: ['files', 'storage', 'share'] }],
  ['calendar.google.com', { platform: 'google-calendar', skills: ['calendar', 'events', 'schedule'] }],
  ['github.com', { platform: 'github', skills: ['code', 'repository', 'pullrequest', 'issues'] }],
  ['notion.so', { platform: 'notion', skills: ['notes', 'database', 'wiki', 'tasks'] }],
  ['trello.com', { platform: 'trello', skills: ['kanban', 'cards', 'tasks', 'boards'] }],
  ['slack.com', { platform: 'slack', skills: ['messaging', 'channels', 'threads'] }],
  ['twitter.com', { platform: 'twitter', skills: ['social', 'posts', 'timeline', 'messages'] }],
  ['x.com', { platform: 'twitter', skills: ['social', 'posts', 'timeline', 'messages'] }],
  ['linkedin.com', { platform: 'linkedin', skills: ['professional', 'network', 'jobs', 'posts'] }],
  ['reddit.com', { platform: 'reddit', skills: ['forum', 'posts', 'comments', 'communities'] }],
  ['instagram.com', { platform: 'instagram', skills: ['social', 'photos', 'stories', 'reels'] }],
  ['amazon.com', { platform: 'amazon', skills: ['shopping', 'products', 'cart', 'reviews'] }],
]);

const SHOPIFY_ADMIN_ENTRY: PlatformEntry = {
  platform: 'shopify',
  skills: ['ecommerce', 'products', 'orders', 'inventory'],
};

const DEFAULT_ENTRY: PlatformEntry = {
  platform: 'unknown',
  skills: ['browse', 'navigate', 'interact'],
};

function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isShopifyAdmin(hostname: string, path: string): boolean {
  return hostname.endsWith('.myshopify.com') && path.startsWith('/admin');
}

export function detectSkills(url: string, _title: string): SkillDetectionResult {
  if (!url) {
    return { skills: DEFAULT_ENTRY.skills, platform: DEFAULT_ENTRY.platform, confidence: 0.5 };
  }

  const hostname = extractHostname(url);
  if (!hostname) {
    return { skills: DEFAULT_ENTRY.skills, platform: DEFAULT_ENTRY.platform, confidence: 0.5 };
  }

  let parsedPath = '/';
  try { parsedPath = new URL(url).pathname; } catch { /* keep default */ }

  // Shopify admin check
  if (isShopifyAdmin(hostname, parsedPath)) {
    return { skills: SHOPIFY_ADMIN_ENTRY.skills, platform: SHOPIFY_ADMIN_ENTRY.platform, confidence: 1.0 };
  }

  // Exact domain match (host equals or www. prefix)
  for (const [domain, entry] of PLATFORM_MAP) {
    if (hostname === domain || hostname === `www.${domain}`) {
      return { skills: entry.skills, platform: entry.platform, confidence: 1.0 };
    }
  }

  // Subdomain match (e.g. mail.google.com matching gmail.com is NOT desired,
  // but m.youtube.com matching youtube.com IS)
  for (const [domain, entry] of PLATFORM_MAP) {
    if (hostname.endsWith(`.${domain}`)) {
      return { skills: entry.skills, platform: entry.platform, confidence: 0.8 };
    }
  }

  return { skills: DEFAULT_ENTRY.skills, platform: DEFAULT_ENTRY.platform, confidence: 0.5 };
}
