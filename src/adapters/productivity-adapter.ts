/**
 * ProductivityAdapter — composite adapter for productivity platform detection
 * and interaction. Delegates to platform-specific adapters.
 */

import type { IProductivityPort, ProductivityPlatform } from '../ports/productivity.port';
import { NotionAdapter } from './notion-adapter';
import { GitHubAdapter } from './github-adapter';

export class ProductivityAdapter implements IProductivityPort {
  readonly notion: NotionAdapter;
  readonly github: GitHubAdapter;

  constructor() {
    this.notion = new NotionAdapter();
    this.github = new GitHubAdapter();
  }

  detectPlatform(): ProductivityPlatform {
    if (this.notion.isOnNotion()) return 'notion';
    if (this.github.isOnGitHub()) return 'github';
    return 'unknown';
  }

  isProductivityApp(): boolean {
    return this.detectPlatform() !== 'unknown';
  }
}
