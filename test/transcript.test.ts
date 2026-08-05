import assert from "node:assert/strict";
import test from "node:test";
import { createGoalState } from "../src/lifecycle.js";
import {
  assistantWasInterrupted,
  buildTranscript,
  goalTokens,
  latestAssistantEntry,
} from "../src/transcript.js";

const goal = createGoalState({ objective: "tests pass", now: 10, goalId: "goal-1" });
const branch = [
  {
    type: "message",
    id: "old",
    timestamp: new Date(1).toISOString(),
    message: { role: "user", content: "before" },
  },
  {
    type: "message",
    id: "user",
    timestamp: new Date(10).toISOString(),
    message: { role: "user", content: "run tests" },
  },
  {
    type: "message",
    id: "assistant",
    timestamp: new Date(20).toISOString(),
    message: {
      role: "assistant",
      timestamp: 20,
      content: [
        { type: "text", text: "I ran them." },
        { type: "toolCall", name: "bash", arguments: { command: "npm test" } },
      ],
      usage: { input: 100, output: 25, cacheRead: 1_000, cacheWrite: 50 },
    },
  },
];

test("builds recent evidence and excludes cache tokens", () => {
  const transcript = buildTranscript(branch, goal, 10_000);
  assert.doesNotMatch(transcript, /before/);
  assert.match(transcript, /I ran them/);
  assert.match(transcript, /tool call bash/);
  assert.equal(goalTokens(branch, goal), 125);
  assert.equal(latestAssistantEntry(branch, goal)?.id, "assistant");
});

test("detects interruption and truncates old evidence", () => {
  assert.equal(assistantWasInterrupted([{ role: "assistant", stopReason: "aborted" }]), true);
  assert.match(buildTranscript(branch, goal, 20), /Earlier goal transcript omitted/);
});
