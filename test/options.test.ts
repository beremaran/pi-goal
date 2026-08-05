import assert from "node:assert/strict";
import test from "node:test";
import { parseGoalCommand, parseTokenCount, resolveOptions } from "../src/options.js";

test("parses lifecycle commands and budgets", () => {
  const defaults = resolveOptions({ defaultMaxTurns: 10 });
  assert.deepEqual(parseGoalCommand("", defaults), { action: "status" });
  assert.deepEqual(parseGoalCommand("pause", defaults), { action: "pause" });
  assert.deepEqual(parseGoalCommand("--tokens 125k all tests pass", defaults), {
    action: "set",
    objective: "all tests pass",
    tokenBudget: 125_000,
    maxTurns: 10,
  });
});

test("parses human-readable token counts and rejects invalid options", () => {
  assert.equal(parseTokenCount("1.5m"), 1_500_000);
  assert.equal(parseTokenCount("0"), undefined);
  assert.deepEqual(parseGoalCommand("--unknown finish", resolveOptions({})), {
    action: "invalid",
    message: "Unknown goal option: --unknown",
  });
});
