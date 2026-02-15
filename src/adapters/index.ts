/**
 * Barrel exports for the adapter layer.
 */

export { ChromeToolAdapter } from './chrome-tool-adapter';
export { ChromeContextAdapter } from './chrome-context-adapter';
export type { ChromeContextAdapterConfig } from './chrome-context-adapter';
export { PlanningAdapter } from './planning-adapter';
export { SubagentAdapter } from './subagent-adapter';
export type { SubagentLimits } from './subagent-adapter';
export { AgentOrchestrator } from './agent-orchestrator';
export type { OrchestratorDeps, OrchestratorLimits } from './agent-orchestrator';
export { ContextManager } from './context-manager';
export type { ContextManagerConfig } from './context-manager';
export { TypedEventBus } from './event-bus';
export { ApprovalGateAdapter } from './approval-gate-adapter';
export type { ApprovalCallback, TierResolver } from './approval-gate-adapter';
export { TabSessionAdapter } from './tab-session-adapter';
export { NavigationPlanAdapter, resolveTemplate } from './navigation-plan-adapter';
export { BackgroundTaskAdapter } from './background-task-adapter';
export { CronSchedulerAdapter } from './cron-scheduler-adapter';
export { IndexedDBToolCacheAdapter, urlToPattern, extractSite, hashTools } from './indexeddb-tool-cache-adapter';
export { InstagramAdapter, isInstagram } from './instagram-adapter';
export { EcommerceAdapter, requireNonEmpty } from './ecommerce-adapter';
export { SemanticCrawlerAdapter, extractToolsFromHTML, extractInternalLinks, matchesPatterns, globToRegex } from './semantic-crawler-adapter';
export { NotionAdapter } from './notion-adapter';
export { GitHubAdapter } from './github-adapter';
export { ProductivityAdapter } from './productivity-adapter';
