/**
 * Barrel exports for the adapter layer.
 */

export { ChromeToolAdapter } from './chrome-tool-adapter';
export { ChromeContextAdapter } from './chrome-context-adapter';
export type { ChromeContextAdapterConfig } from './chrome-context-adapter';
export { PlanningAdapter } from './planning-adapter';
export { SubagentAdapter } from './subagent-adapter';
export { AgentOrchestrator } from './agent-orchestrator';
export type { OrchestratorDeps } from './agent-orchestrator';
export { ContextManager } from './context-manager';
export type { ContextManagerConfig } from './context-manager';
export { TypedEventBus } from './event-bus';
export { ApprovalGateAdapter } from './approval-gate-adapter';
export type { ApprovalCallback, TierResolver } from './approval-gate-adapter';
export { TabSessionAdapter } from './tab-session-adapter';
export { NavigationPlanAdapter, resolveTemplate } from './navigation-plan-adapter';
export { BackgroundTaskAdapter } from './background-task-adapter';
