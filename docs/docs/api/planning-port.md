---
sidebar_position: 4
---

# IPlanningPort

Manages execution plans with step-by-step progress tracking, failure handling, and real-time observer notifications.

## Interface

```typescript
export interface IPlanningPort {
  createPlan(goal: string, steps: PlanStep[]): Plan;
  updatePlan(goal: string, steps: PlanStep[]): Plan;
  getCurrentPlan(): Plan | null;
  advanceStep(): void;
  markStepDone(detail?: string): void;
  markStepFailed(detail?: string): void;
  onPlanChanged(callback: (plan: Plan | null) => void): () => void;
}
```

## Methods

| Method | Description |
|--------|-------------|
| `createPlan(goal, steps)` | Creates a new plan, replacing any existing one |
| `updatePlan(goal, steps)` | Updates the current plan's goal and steps |
| `getCurrentPlan()` | Returns the active plan or `null` |
| `advanceStep()` | Moves to the next pending step |
| `markStepDone(detail?)` | Marks the current step as completed |
| `markStepFailed(detail?)` | Marks the current step as failed |
| `onPlanChanged(callback)` | Subscribes to plan state changes |

## Types

```typescript
interface Plan {
  goal: string;
  steps: PlanStep[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: number;
}

interface PlanStep {
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  detail?: string;
}
```

## Adapter: PlanningAdapter

Wraps the existing `PlanManager` class. Subagents receive a **no-op** `IPlanningPort` to avoid corrupting the parent plan state.
