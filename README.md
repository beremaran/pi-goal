# Pi Goal

[![CI](https://github.com/beremaran/pi-goal/actions/workflows/ci.yml/badge.svg)](https://github.com/beremaran/pi-goal/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@beremaran/pi-goal)](https://www.npmjs.com/package/@beremaran/pi-goal)
[![license](https://img.shields.io/npm/l/@beremaran/pi-goal)](LICENSE)

A persistent `/goal` workflow for [Pi](https://pi.dev): define a completion
condition once, let Pi work across turns, and stop only when an independent
evaluator finds enough evidence that the condition is satisfied.

This is a Pi port of [OpenCode Goal](https://github.com/beremaran/opencode-goal).
It uses Pi's extension API and session entries rather than an external state
directory, so goal state follows the current session branch and survives
restarts and compaction.

## Install

Try it for one run:

```bash
pi -e git:github.com/beremaran/pi-goal
```

Install it for all projects:

```bash
pi install git:github.com/beremaran/pi-goal
```

Or add the package to `~/.pi/agent/settings.json`:

```json
{
  "packages": ["git:github.com/beremaran/pi-goal"]
}
```

Pin a release tag in shared or automated configuration:

```bash
pi install git:github.com/beremaran/pi-goal@v0.1.0
```

## Usage

```text
/goal all authentication tests pass and lint is clean
/goal --tokens 100k migrate every call site and make the build pass
/goal --max-turns 20 diagnose and fix the intermittent queue test
```

Control the current session goal with:

```text
/goal          Show status, elapsed time, turns, tokens, and the last evaluation
/goal pause    Pause automatic continuation
/goal resume   Resume work immediately
/goal clear    Remove the session goal
/goal help     Show command syntax
```

When a user explicitly asks for persistent goal tracking in ordinary language,
Pi can start it with the `create_goal` tool. The tool refuses to replace an
unfinished goal. `get_goal` reports state and `update_goal` records a completion
claim for independent verification or a repeated external blocker.

## How it works

1. `/goal` persists a goal as a Pi custom session entry and starts a work turn.
2. Active goal context is re-injected into each agent system prompt.
3. When the agent settles, the extension builds a bounded transcript from the
   current branch and asks an evaluator model for a conservative JSON decision.
4. A negative decision is saved and queued as the next user turn.
5. A positive decision marks the goal complete and stops continuation.

The evaluator has no tools and judges only evidence surfaced in the transcript.
Interrupted or failed agent turns pause the goal instead of risking an
unverified loop. Token and turn budgets are optional; without them, an active
goal continues until it completes, is paused, cleared, blocked, or encounters
an evaluator failure.

The active goal appears in Pi's footer and in a compact widget above the editor.

## Configuration

The extension reads these optional environment variables at startup:

| Variable                        | Meaning                                                                 |
| ------------------------------- | ----------------------------------------------------------------------- |
| `PI_GOAL_EVALUATOR_MODEL`       | Evaluator model in `provider/model` form; defaults to the current model |
| `PI_GOAL_MAX_TRANSCRIPT_CHARS`  | Maximum transcript sent to the evaluator; default `48000`               |
| `PI_GOAL_DEFAULT_TOKEN_BUDGET`  | Default token budget for `create_goal`                                  |
| `PI_GOAL_DEFAULT_MAX_TURNS`     | Default turn budget for `create_goal`                                   |
| `PI_GOAL_CONTINUATION_DELAY_MS` | Delay before automatic continuation; default `0`                        |

For example:

```bash
PI_GOAL_EVALUATOR_MODEL=anthropic/claude-haiku-4-5 pi
```

Goal state is stored in Pi's session JSONL as `pi-goal.state` custom entries.
Custom entries do not enter the model context, and branch navigation naturally
restores the state at that point in the session.

## Development

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/beremaran/pi-goal.git
cd pi-goal
npm ci
npm run check
```

Load the checkout directly:

```bash
pi -e ./extensions/pi-goal.ts
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow and
[RELEASING.md](RELEASING.md) for maintainer release instructions.

## Limitations

- The evaluator can judge only transcript evidence. If work happened but was
  not surfaced, it asks for stronger evidence and continues.
- This extension cannot bypass provider rate, usage, trust, or permission
  limits.
- A provider or evaluator failure pauses the goal; use `/goal resume` after the
  problem is fixed.
- Automatic continuation is intentionally conservative and may use additional
  model credits.

## License

[MIT](LICENSE)
