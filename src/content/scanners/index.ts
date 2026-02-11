/**
 * Scanner Registry — registers all 12 category scanners, runs them
 * in priority order, deduplicates results, and supports cache invalidation.
 */

import type { Tool, ToolCategory } from '../../types';
import { SCANNER_CATEGORIES } from '../../utils/constants';
import { BaseScanner, collectShadowRoots } from './base-scanner';
import { FormScanner } from './form-scanner';
import { NavigationScanner } from './navigation-scanner';
import { SearchScanner } from './search-scanner';
import { RichTextScanner } from './richtext-scanner';
import { SocialScanner } from './social-scanner';
import { FileUploadScanner } from './file-upload-scanner';
import { InteractiveScanner } from './interactive-scanner';
import { MediaScanner } from './media-scanner';
import { EcommerceScanner } from './ecommerce-scanner';
import { AuthScanner } from './auth-scanner';
import { PageStateScanner } from './page-state-scanner';
import { SchemaOrgScanner } from './schema-org-scanner';

export { BaseScanner, collectShadowRoots } from './base-scanner';
export { claimElement, isElementClaimed, isSocialKeyword } from './base-scanner';

/** Map from category name to scanner instance */
const SCANNER_MAP: ReadonlyMap<ToolCategory, BaseScanner> = new Map<ToolCategory, BaseScanner>([
  ['form', new FormScanner()],
  ['navigation', new NavigationScanner()],
  ['search', new SearchScanner()],
  ['richtext', new RichTextScanner()],
  ['social-action', new SocialScanner()],
  ['file-upload', new FileUploadScanner()],
  ['interactive', new InteractiveScanner()],
  ['media', new MediaScanner()],
  ['ecommerce', new EcommerceScanner()],
  ['auth', new AuthScanner()],
  ['page-state', new PageStateScanner()],
  ['schema-org', new SchemaOrgScanner()],
]);

export class ScannerRegistry {
  private readonly scanners: BaseScanner[];

  constructor() {
    // Build scanner list in SCANNER_CATEGORIES priority order
    this.scanners = SCANNER_CATEGORIES.map(cat => {
      const scanner = SCANNER_MAP.get(cat);
      if (!scanner) throw new Error(`No scanner registered for category: ${cat}`);
      return scanner;
    });
  }

  /**
   * Run all 12 scanners on a root node (+ open Shadow DOM roots).
   * Deduplicates by tool name, keeping the highest-confidence entry.
   */
  scanAll(root: Document | Element | ShadowRoot = document): Tool[] {
    const allTools: Tool[] = [];

    // Scan main root
    for (const scanner of this.scanners) {
      try {
        allTools.push(...scanner.scan(root));
      } catch (e) {
        console.warn(
          `[ScannerRegistry] Scanner "${scanner.category}" failed:`,
          (e as Error).message,
        );
      }
    }

    // Scan open Shadow DOM roots
    const shadowRoots = collectShadowRoots(root);
    if (shadowRoots.length > 0) {
      for (const sr of shadowRoots) {
        for (const scanner of this.scanners) {
          try {
            allTools.push(...scanner.scan(sr));
          } catch (e) {
            console.warn(
              `[ScannerRegistry] Shadow scanner "${scanner.category}" failed:`,
              (e as Error).message,
            );
          }
        }
      }
    }

    // Deduplicate by name — keep highest confidence
    const deduped = new Map<string, Tool>();
    for (const tool of allTools) {
      const existing = deduped.get(tool.name);
      if (!existing || (tool.confidence ?? 0) > (existing.confidence ?? 0)) {
        deduped.set(tool.name, tool);
      }
    }

    return [...deduped.values()];
  }

  /** Get a specific scanner by category */
  getScanner(category: ToolCategory): BaseScanner | undefined {
    return SCANNER_MAP.get(category);
  }
}
