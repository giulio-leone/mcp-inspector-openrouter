/** Status of a plan step */
export type PlanStepStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'skipped';

/** A single step in an AI execution plan */
export interface PlanStep {
  /** Unique ID for this step (e.g., "step-1", "step-2.1") */
  id: string;
  /** Human-readable title */
  title: string;
  /** Current status */
  status: PlanStepStatus;
  /** Optional detail/result message */
  detail?: string;
  /** Sub-steps for hierarchical plans */
  children?: PlanStep[];
  /** Tool name that will be used (if known) */
  toolName?: string;
  /** Tool arguments (if known) */
  toolArgs?: Record<string, unknown>;
}

/** A complete execution plan created by the AI */
export interface Plan {
  /** Overall goal description */
  goal: string;
  /** Ordered list of steps */
  steps: PlanStep[];
  /** When the plan was created */
  createdAt: number;
  /** Overall status derived from steps */
  status: PlanStepStatus;
}

/** Format the AI should return the plan in (embedded in text response) */
export interface AIPlanResponse {
  /** Marker indicating this is a plan */
  type: 'plan';
  /** The plan data */
  plan: {
    goal: string;
    steps: Array<{
      id: string;
      title: string;
      children?: Array<{
        id: string;
        title: string;
      }>;
    }>;
  };
}
