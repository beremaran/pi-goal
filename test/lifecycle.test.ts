import assert from "node:assert/strict";
import test from "node:test";
import { createGoalState, formatDuration, goalSummary, remainingTokens } from "../src/lifecycle.js";

test("creates and summarizes a goal", () => {
  const goal = createGoalState({
    objective: "tests pass",
    tokenBudget: 10_000,
    now: 1_000,
    goalId: "goal-1",
  });
  assert.equal(goal.goalId, "goal-1");
  assert.equal(remainingTokens(goal), 10_000);
  assert.equal(formatDuration(61_000), "1m 1s");
  assert.match(goalSummary({ ...goal, turns: 2, tokensUsed: 1_000 }, 62_000), /2 turns/);
});
