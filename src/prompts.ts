import { remainingTokens } from "./lifecycle.js";
import type { GoalState } from "./types.js";

function budgetContext(goal: GoalState): string {
  return [
    `turns_used=${goal.turns}`,
    `max_turns=${goal.maxTurns ?? "unbounded"}`,
    `tokens_used=${goal.tokensUsed}`,
    `token_budget=${goal.tokenBudget ?? "unbounded"}`,
    `remaining_tokens=${remainingTokens(goal) ?? "unbounded"}`,
  ].join(" ");
}

export function activeGoalContext(goal: GoalState): string {
  return `<active-goal>\n<objective>${goal.objective}</objective>\n<progress>${budgetContext(goal)}</progress>\n</active-goal>\n\nKeep working toward this objective while it is active. Do not claim completion without concrete evidence. Use update_goal with status "complete" when genuinely achieved, or "blocked" only after the same external blocker recurs for at least three goal turns.`;
}

export function startingPrompt(goal: GoalState): string {
  return `<goal>\n<objective>${goal.objective}</objective>\n<progress>${budgetContext(goal)}</progress>\n</goal>\n\nWork toward this completion condition now. Continue making concrete progress until it is genuinely satisfied. Verify the result with the strongest practical evidence available. If complete, call update_goal with status "complete" and a concise evidence-based reason. Mark it "blocked" only after the same external blocker has prevented progress for at least three goal turns.`;
}

export function continuationPrompt(goal: GoalState): string {
  return `<goal-continuation>\n<objective>${goal.objective}</objective>\n<progress>${budgetContext(goal)}</progress>\n<evaluation>${goal.lastReason ?? "The completion condition is not yet established."}</evaluation>\n</goal-continuation>\n\nThe goal remains active. Continue from the current state and address the evaluator's reason. Make concrete progress, verify it, and surface the evidence. Do not simply restate the plan or ask whether to continue. If genuinely complete, call update_goal with status "complete". Mark it "blocked" only after the same external blocker has recurred for at least three goal turns.`;
}

export function budgetLimitPrompt(goal: GoalState): string {
  return `<goal-budget-reached>\n<objective>${goal.objective}</objective>\n<progress>${budgetContext(goal)}</progress>\n</goal-budget-reached>\n\nThe goal's configured budget has been reached. Do not start additional work. Give the user a concise handoff describing what is complete, what remains, the verification performed, and the exact next step.`;
}

export function helpPrompt(): string {
  return `Usage:\n/goal <completion condition>\n/goal --tokens 100k <completion condition>\n/goal --max-turns 20 <completion condition>\n/goal\n/goal pause\n/goal resume\n/goal clear\n\nActive goals are independently evaluated after each turn and continue until complete, paused, cleared, blocked, or budget-limited.`;
}

export const EVALUATOR_SYSTEM_PROMPT = `You are a conservative completion evaluator for a long-running coding-agent goal.\n\nJudge only whether the stated completion condition is fully satisfied based on evidence surfaced in the transcript. Do not call tools. Do not assume unreported work succeeded. If tests, builds, or checks are part of the condition, require transcript evidence that they ran and passed. If any required work remains, return complete=false.\n\nReturn exactly one JSON object with this shape and no markdown:\n{"complete":false,"reason":"one short, actionable sentence"}`;

export function evaluatorPrompt(goal: GoalState, transcript: string): string {
  const claim = goal.completionClaim
    ? `\nThe working agent claimed completion: ${goal.completionClaim.reason}\n`
    : "";
  return `<completion-condition>\n${goal.objective}\n</completion-condition>${claim}\n<transcript>\n${transcript}\n</transcript>\n\nIs the completion condition fully satisfied? Return the required JSON object.`;
}
