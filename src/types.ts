export const GOAL_STATUSES = [
  "active",
  "paused",
  "complete",
  "blocked",
  "budget_limited",
  "turn_limited",
] as const;

export type GoalStatus = (typeof GOAL_STATUSES)[number];

export type CompletionClaim = {
  reason: string;
  createdAt: number;
};

export type GoalState = {
  version: 1;
  goalId: string;
  objective: string;
  status: GoalStatus;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  turns: number;
  tokensUsed: number;
  tokenBudget?: number;
  maxTurns?: number;
  lastEvaluatedEntryId?: string;
  lastReason?: string;
  completionClaim?: CompletionClaim;
};

export type EvaluationDecision = {
  complete: boolean;
  reason: string;
  error?: boolean;
};

export type GoalExtensionOptions = {
  evaluatorModel?: string;
  maxTranscriptChars?: number;
  defaultTokenBudget?: number;
  defaultMaxTurns?: number;
  continuationDelayMs?: number;
};

export type ResolvedGoalExtensionOptions = {
  evaluatorModel?: string;
  maxTranscriptChars: number;
  defaultTokenBudget?: number;
  defaultMaxTurns?: number;
  continuationDelayMs: number;
};

export type GoalCommand =
  | { action: "status" }
  | { action: "help" }
  | { action: "clear" }
  | { action: "pause" }
  | { action: "resume" }
  | { action: "set"; objective: string; tokenBudget?: number; maxTurns?: number }
  | { action: "invalid"; message: string };
