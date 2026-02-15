/**
 * ICrawlerPort — Port for crawling sites and pre-mapping tool manifests.
 *
 * Crawls pages from entry points, extracts semantic tool definitions,
 * and stores them in the IToolCachePort for offline/fast lookups.
 */

import type { CleanTool } from '../types';

/** Configuration for a crawl operation */
export interface CrawlTarget {
  /** Site hostname to crawl (e.g., "youtube.com") */
  readonly site: string;
  /** Starting URLs for crawl (e.g., ["https://youtube.com"]) */
  readonly entryPoints: readonly string[];
  /** Max pages to crawl (default: 50) */
  readonly maxPages?: number;
  /** Max crawl depth from entry points (default: 3) */
  readonly maxDepth?: number;
  /** URL patterns to include (glob-like) */
  readonly includePatterns?: readonly string[];
  /** URL patterns to exclude (glob-like) */
  readonly excludePatterns?: readonly string[];
}

/** Live progress of a crawl operation */
export interface CrawlProgress {
  readonly pagesScanned: number;
  readonly pagesTotal: number;
  readonly currentUrl: string;
  readonly toolsFound: number;
  readonly errors: number;
}

/** Summary result of a completed crawl */
export interface CrawlResult {
  readonly site: string;
  readonly pagesScanned: number;
  readonly toolsDiscovered: number;
  readonly duration: number;
  readonly errors: readonly string[];
}

export interface ICrawlerPort {
  /** Crawl a site and populate the tool cache */
  crawl(
    target: CrawlTarget,
    onProgress?: (p: CrawlProgress) => void,
  ): Promise<CrawlResult>;

  /** Cancel an in-progress crawl */
  cancel(): void;

  /** Check if a crawl is in progress */
  isRunning(): boolean;
}

// Re-export CleanTool for adapter convenience
export type { CleanTool };
