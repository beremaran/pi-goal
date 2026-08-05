import { randomUUID } from "node:crypto";
import type { GoalState } from "./types.js";

export function createGoalState(input: {
  objective: string;
  tokenBudget?: number;
  maxTurns?: number;
  now?: number;
  goalId?: string;
}): GoalState {
  const now = input.now ?? Date.now();
  const goal: GoalState = {
    version: 1,
    goalId: input.goalId ?? randomUUID(),
    objective: input.objective.trim(),
    status: "active",
    createdAt: now,
    updatedAt: now,
    turns: 0,
    tokensUsed: 0,
  };
  if (input.tokenBudget !== undefined) goal.tokenBudget = input.tokenBudget;
  if (input.maxTurns !== undefined) goal.maxTurns = input.maxTurns;
  return goal;
}

export function remainingTokens(goal: GoalState): number | undefined {
  return goal.tokenBudget === undefined
    ? undefined
    : Math.max(goal.tokenBudget - goal.tokensUsed, 0);
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(Math.floor(milliseconds / 1_000), 0);
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

export function goalSummary(goal: GoalState, now = Date.now()): string {
  const budget =
    goal.tokenBudget === undefined
      ? `${goal.tokensUsed.toLocaleString()} tokens`
      : `${goal.tokensUsed.toLocaleString()} / ${goal.tokenBudget.toLocaleString()} tokens`;
  const turns =
    goal.maxTurns === undefined ? `${goal.turns} turns` : `${goal.turns} / ${goal.maxTurns} turns`;
  const reason = goal.lastReason ? `\nLast evaluation: ${goal.lastReason}` : "";
  return (
    [
      `Goal status: ${goal.status}`,
      `Objective: ${goal.objective}`,
      `Progress: ${turns}; ${budget}; ${formatDuration(now - goal.createdAt)} elapsed`,
    ].join("\n") + reason
  );
}
