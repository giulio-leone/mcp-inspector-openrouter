/**
 * Social Action Scanner — discovers social media actions across platforms
 * (Facebook, Instagram, WhatsApp, X, LinkedIn, Threads, etc.).
 */

import type { Tool, ToolAnnotations } from '../../types';
import { BaseScanner } from './base-scanner';

/** Social action classification */
type SocialActionType =
  | 'like'
  | 'share'
  | 'follow'
  | 'comment'
  | 'message'
  | 'save'
  | 'join';

const LIKE_RE = /\b(reagisci|like|mi piace|consiglia|upvote|heart|reaction|react|love)\b/i;
const SHARE_RE = /\b(share|condividi|diffondi|repost|retweet|forward|inoltra|send to|invia a)\b/i;
const FOLLOW_RE = /\b(follow|segui|subscribe|iscriviti|segui già|following)\b/i;
const COMMENT_RE = /\b(comment|commenta|reply|rispondi|risposta|add comment|leave a comment)\b/i;
const MESSAGE_RE = /\b(message|messaggio|chat|invia messaggio|send message|whatsapp|dm|direct message)\b/i;
const SAVE_RE = /\b(save|salva|bookmark|preferiti|saved)\b/i;
const JOIN_RE = /\b(join|unisciti|iscriviti al gruppo|partecipa)\b/i;

const DESCRIPTIONS: Record<SocialActionType, string> = {
  like: 'Like/React',
  share: 'Share/Repost',
  follow: 'Follow/Subscribe',
  comment: 'Open comment/reply composer',
  message: 'Open message/chat action',
  save: 'Save/Bookmark content',
  join: 'Join community/channel/group',
};

const TITLES: Record<SocialActionType, string> = {
  like: 'Like',
  share: 'Share',
  follow: 'Follow',
  comment: 'Comment',
  message: 'Message',
  save: 'Save',
  join: 'Join',
};

const PLATFORM_MAP: ReadonlyArray<{ re: RegExp; name: string }> = [
  { re: /facebook|fb\.com/i, name: 'facebook' },
  { re: /instagram/i, name: 'instagram' },
  { re: /whatsapp/i, name: 'whatsapp' },
  { re: /twitter|x\.com/i, name: 'x' },
  { re: /linkedin/i, name: 'linkedin' },
  { re: /threads\.net/i, name: 'threads' },
  { re: /tiktok/i, name: 'tiktok' },
  { re: /reddit/i, name: 'reddit' },
  { re: /youtube/i, name: 'youtube' },
];

const X_TESTID_RULES: ReadonlyArray<{
  token: string;
  action: SocialActionType;
}> = [
  { token: 'reply', action: 'comment' },
  { token: 'retweet', action: 'share' },
  { token: 'unretweet', action: 'share' },
  { token: 'quote', action: 'share' },
  { token: 'share', action: 'share' },
  { token: 'like', action: 'like' },
  { token: 'unlike', action: 'like' },
  { token: 'userfollow', action: 'follow' },
  { token: 'userunfollow', action: 'follow' },
  { token: 'follow', action: 'follow' },
  { token: 'bookmark', action: 'save' },
  { token: 'removebookmark', action: 'save' },
  { token: 'dm', action: 'message' },
  { token: 'message', action: 'message' },
  { token: 'senddm', action: 'message' },
];

export class SocialScanner extends BaseScanner {
  readonly category = 'social-action' as const;

  scan(root: Document | Element | ShadowRoot): Tool[] {
    const tools: Tool[] = [];
    const seen = new Set<string>();

    const candidates = (root as ParentNode).querySelectorAll(
      [
        'button',
        '[role="button"]',
        'a[aria-label]',
        '[aria-label][tabindex]',
        '[data-testid*="like" i]',
        '[data-testid*="share" i]',
        '[data-testid*="retweet" i]',
        '[data-testid*="unretweet" i]',
        '[data-testid*="follow" i]',
        '[data-testid*="userfollow" i]',
        '[data-testid*="userunfollow" i]',
        '[data-testid*="comment" i]',
        '[data-testid*="reply" i]',
        '[data-testid*="message" i]',
        '[data-testid*="dm" i]',
        '[data-testid*="save" i]',
        '[data-testid*="bookmark" i]',
        '[data-icon="send"]',
        '[aria-label*="whatsapp" i]',
      ].join(', '),
    );

    const platform = this.detectPlatform(location.hostname);

    for (const btn of candidates) {
      if (tools.length >= this.maxTools) break;
      if (this.isClaimed(btn)) continue;
      if (!this.isVisible(btn)) continue;
      if (!this.hasMeaningfulSize(btn)) continue;
      if ((btn as HTMLElement).isContentEditable) continue;
      if (btn.getAttribute('role') === 'textbox') continue;

      const label = (btn.getAttribute('aria-label') || '').trim();
      const testId = this.resolveTestId(btn);
      const text = (btn.textContent || '').trim();
      const className = (btn.getAttribute('class') || '').toLowerCase();
      const href = (btn.getAttribute('href') || '').toLowerCase();
      const dataIcon = (btn.getAttribute('data-icon') || '').toLowerCase();
      if (!label && !testId && !text && !className && !href && !dataIcon) continue;

      // Classify by label or data-testid
      const actionType = this.classify({
        platform,
        label,
        text,
        testId,
        className,
        href,
        dataIcon,
      });
      if (!actionType) continue;

      // Build a short, clean slug
      const shortLabel = (label || text).slice(0, 48) || actionType;
      const slug = this.slugify(`${platform}-${shortLabel}`) || `${platform}-${actionType}`;
      const key = `${platform}-${actionType}-${slug}`;
      if (seen.has(key)) continue;
      seen.add(key);

      this.claim(btn);
      tools.push(
        this.createTool(
          `social.${actionType}-${slug}`,
          `[${platform}] ${DESCRIPTIONS[actionType]}: ${shortLabel}`,
          btn,
          this.makeInputSchema([]),
          0.86,
          {
            title: `[${platform}] ${TITLES[actionType]}: ${shortLabel}`,
            annotations: this.socialAnnotations(actionType),
          },
        ),
      );
    }

    return tools;
  }

  /** Classify a candidate element into a social action type */
  private classify(
    ctx: {
      platform: string;
      label: string;
      text: string;
      testId: string;
      className: string;
      href: string;
      dataIcon: string;
    },
  ): SocialActionType | null {
    if (ctx.platform === 'x') {
      for (const rule of X_TESTID_RULES) {
        if (ctx.testId.includes(rule.token)) {
          return rule.action;
        }
      }
    }

    const joined = [
      ctx.label,
      ctx.text,
      ctx.testId,
      ctx.className,
      ctx.href,
      ctx.dataIcon,
    ]
      .join(' ')
      .toLowerCase();

    if (LIKE_RE.test(joined) || joined.includes('heart') || joined.includes('reaction')) {
      return 'like';
    }
    if (SHARE_RE.test(joined) || joined.includes('retweet') || joined.includes('repost')) {
      return 'share';
    }
    if (FOLLOW_RE.test(joined) || joined.includes('subscribe')) {
      return 'follow';
    }
    if (COMMENT_RE.test(joined) || joined.includes('reply') || joined.includes('comment')) {
      return 'comment';
    }
    if (
      MESSAGE_RE.test(joined) ||
      joined.includes('data-icon="send"') ||
      joined.includes('direct message') ||
      joined.includes('dm')
    ) {
      return 'message';
    }
    if (SAVE_RE.test(joined)) {
      return 'save';
    }
    if (JOIN_RE.test(joined)) {
      return 'join';
    }

    return null;
  }

  private socialAnnotations(actionType: SocialActionType): ToolAnnotations {
    return this.makeAnnotations({
      destructive: actionType !== 'comment' && actionType !== 'message',
      idempotent: actionType === 'comment' || actionType === 'message',
    });
  }

  private detectPlatform(hostname: string): string {
    const lower = hostname.toLowerCase();
    for (const row of PLATFORM_MAP) {
      if (row.re.test(lower)) return row.name;
    }
    return 'social';
  }

  private resolveTestId(el: Element): string {
    const own = el.getAttribute('data-testid');
    if (own) return own.toLowerCase();

    const closest = el.closest('[data-testid]');
    const closestTestId = closest?.getAttribute('data-testid');
    if (closestTestId) return closestTestId.toLowerCase();

    const child = el.querySelector('[data-testid]');
    const childTestId = child?.getAttribute('data-testid');
    if (childTestId) return childTestId.toLowerCase();

    return '';
  }
}
