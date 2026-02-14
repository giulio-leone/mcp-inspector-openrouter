/**
 * Barrel exports for the hexagonal port layer.
 */

// Ports
export type { IAgentPort } from './agent.port';
export type { IToolExecutionPort } from './tool-execution.port';
export type { IPlanningPort } from './planning.port';
export type { ISubagentPort } from './subagent.port';
export type { IContextPort } from './context.port';
export type { IContextManagerPort } from './context-manager.port';
export type { IApprovalGatePort, ApprovalDecision, ApprovalRequest } from './approval-gate.port';
export type { ITabSessionPort, TabContext } from './tab-session.port';
export type {
  IBackgroundTaskPort,
  BackgroundTask,
  BackgroundTaskStatus,
  BackgroundTaskEventMap,
  EnqueueOptions,
} from './background-task.port';
export type {
  INavigationPlanPort,
  NavigationStepType,
  StepErrorStrategy,
  StepPrecondition,
  NavigationStepBase,
  OpenTabStep,
  NavigateStep,
  ExtractStep,
  FillStep,
  WaitStep,
  CloseTabStep,
  NavigationStep,
  StepStatus,
  StepResult,
  NavigationPlan,
  PlanExecutionState,
} from './navigation-plan.port';

// Shared types
export type {
  AgentContext,
  AgentResult,
  CleanTool,
  ContextSummary,
  LiveStateSnapshot,
  MentionContext,
  Message,
  OrchestratorEvent,
  OrchestratorEventListener,
  PageContext,
  Plan,
  PlanStep,
  SubagentInfo,
  SubagentResult,
  SubagentTask,
  TokenUsage,
  ToolCallRecord,
  ToolCallResult,
  ToolDefinition,
  ToolTarget,
} from './types';
