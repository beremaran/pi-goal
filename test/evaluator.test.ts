import assert from "node:assert/strict";
import test from "node:test";
import { parseEvaluation } from "../src/evaluator.js";

test("parses strict and fenced evaluator responses", () => {
  assert.deepEqual(parseEvaluation('{"complete":true,"reason":"All checks passed."}'), {
    complete: true,
    reason: "All checks passed.",
  });
  assert.deepEqual(
    parseEvaluation('```json\n{"complete":false,"reason":"Lint was not run."}\n```'),
    {
      complete: false,
      reason: "Lint was not run.",
    },
  );
});

test("rejects malformed evaluator responses", () => {
  assert.equal(parseEvaluation("yes"), undefined);
  assert.equal(parseEvaluation('{"complete":"yes","reason":"done"}'), undefined);
  assert.equal(parseEvaluation('{"complete":true,"reason":""}'), undefined);
});
