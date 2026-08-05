import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { evaluateGoal } from "../src/evaluator.js";
import { createGoalState, formatDuration, goalSummary, remainingTokens } from "../src/lifecycle.js";
import { parseGoalCommand, resolveOptions } from "../src/options.js";
import {
  activeGoalContext,
  budgetLimitPrompt,
  continuationPrompt,
  helpPrompt,
  startingPrompt,
} from "../src/prompts.js";
import { assistantWasInterrupted, goalTokens, latestAssistantEntry } from "../src/transcript.js";
import type { GoalExtensionOptions, GoalState } from "../src/types.js";

const STATE_ENTRY = "pi-goal.state";
const STATUS_ID = "pi-goal";

function stateFromBranch(ctx: ExtensionContext): GoalState | undefined {
  let state: GoalState | undefined;
  for (const entry of ctx.sessionManager.getBranch()) {
    if (!entry || typeof entry !== "object") continue;
    const value = entry as { type?: string; customType?: string; data?: unknown };
    if (value.type !== "custom" || value.customType !== STATE_ENTRY) continue;
    if (value.data && typeof value.data === "object" && "cleared" in value.data) {
      state = undefined;
    } else if (value.data) {
      state = value.data as GoalState;
    }
  }
  return state;
}

function statusText(goal: GoalState): string {
  const budget =
    goal.tokenBudget === undefined
      ? ""
      : ` · ${remainingTokens(goal)?.toLocaleString()} tokens left`;
  return `${goal.status}: ${goal.objective.slice(0, 70)}${goal.objective.length > 70 ? "…" : ""} · ${goal.turns} turns${budget}`;
}

function updateUi(ctx: ExtensionContext, goal: GoalState | undefined): void {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus(STATUS_ID, goal ? statusText(goal) : undefined);
  ctx.ui.setWidget(
    STATUS_ID,
    goal
      ? [
          ctx.ui.theme.fg("accent", `Goal · ${goal.status}`),
          ctx.ui.theme.fg("dim", goal.objective.slice(0, 120)),
          ctx.ui.theme.fg(
            "muted",
            `${goal.turns} turns · ${goal.tokensUsed.toLocaleString()} tokens · ${formatDuration(Date.now() - goal.createdAt)}`,
          ),
          ...(goal.lastReason
            ? [ctx.ui.theme.fg("dim", `Last: ${goal.lastReason.slice(0, 120)}`)]
            : []),
        ]
      : undefined,
  );
}

function saveState(pi: ExtensionAPI, goal: GoalState): void {
  pi.appendEntry(STATE_ENTRY, goal);
}

function goalStartTime(ctx: ExtensionContext): number {
  const leaf = ctx.sessionManager.getLeafEntry();
  if (!leaf || typeof leaf !== "object") return Date.now();
  const message = (leaf as { type?: string; message?: { timestamp?: unknown } }).message;
  return typeof message?.timestamp === "number" ? message.timestamp : Date.now();
}

function result(text: string, details?: unknown) {
  return { content: [{ type: "text" as const, text }], details };
}

async function send(pi: ExtensionAPI, ctx: ExtensionContext, text: string): Promise<void> {
  if (ctx.isIdle()) pi.sendUserMessage(text);
  else pi.sendUserMessage(text, { deliverAs: "followUp" });
}

export default function (pi: ExtensionAPI) {
  const options = resolveOptions({
    evaluatorModel: process.env.PI_GOAL_EVALUATOR_MODEL,
    maxTranscriptChars: process.env.PI_GOAL_MAX_TRANSCRIPT_CHARS
      ? Number(process.env.PI_GOAL_MAX_TRANSCRIPT_CHARS)
      : undefined,
    defaultTokenBudget: process.env.PI_GOAL_DEFAULT_TOKEN_BUDGET
      ? Number(process.env.PI_GOAL_DEFAULT_TOKEN_BUDGET)
      : undefined,
    defaultMaxTurns: process.env.PI_GOAL_DEFAULT_MAX_TURNS
      ? Number(process.env.PI_GOAL_DEFAULT_MAX_TURNS)
      : undefined,
    continuationDelayMs: process.env.PI_GOAL_CONTINUATION_DELAY_MS
      ? Number(process.env.PI_GOAL_CONTINUATION_DELAY_MS)
      : undefined,
  } as GoalExtensionOptions);
  let goal: GoalState | undefined;
  let processing = false;

  const restore = (ctx: ExtensionContext) => {
    goal = stateFromBranch(ctx);
    updateUi(ctx, goal);
  };

  pi.on("session_start", async (_event, ctx) => restore(ctx));
  pi.on("session_tree", async (_event, ctx) => restore(ctx));
  pi.on("before_agent_start", async (event, ctx) => {
    if (goal?.status !== "active") return;
    return { systemPrompt: `${event.systemPrompt}\n\n${activeGoalContext(goal)}` };
  });

  pi.registerCommand("goal", {
    description: "Set, inspect, pause, resume, or clear a persistent goal",
    handler: async (args, ctx) => {
      const parsed = parseGoalCommand(args, options);
      if (parsed.action === "status") {
        ctx.ui.notify(goal ? goalSummary(goal) : "There is no goal for this session.", "info");
        return;
      }
      if (parsed.action === "help") {
        ctx.ui.notify(helpPrompt(), "info");
        return;
      }
      if (parsed.action === "invalid") {
        ctx.ui.notify(parsed.message, "error");
        return;
      }
      if (parsed.action === "clear") {
        goal = undefined;
        pi.appendEntry(STATE_ENTRY, { cleared: true });
        updateUi(ctx, goal);
        ctx.ui.notify("The session goal was cleared.", "info");
        return;
      }
      if (parsed.action === "pause") {
        if (!goal || goal.status !== "active") {
          ctx.ui.notify("There is no active goal to pause.", "warning");
          return;
        }
        goal = {
          ...goal,
          status: "paused",
          updatedAt: Date.now(),
          lastReason: "Paused by the user.",
        };
        saveState(pi, goal);
        updateUi(ctx, goal);
        ctx.ui.notify("The session goal is paused.", "info");
        return;
      }
      if (parsed.action === "resume") {
        if (!goal) {
          ctx.ui.notify("There is no goal to resume.", "warning");
          return;
        }
        if (goal.status === "complete") {
          ctx.ui.notify("The previous goal is complete. Set a new goal to do more work.", "info");
          return;
        }
        goal = {
          ...goal,
          status: "active",
          updatedAt: Date.now(),
          lastReason: "Resumed by the user.",
        };
        saveState(pi, goal);
        updateUi(ctx, goal);
        await send(pi, ctx, continuationPrompt(goal));
        return;
      }

      goal = createGoalState({
        objective: parsed.objective,
        tokenBudget: parsed.tokenBudget,
        maxTurns: parsed.maxTurns,
      });
      saveState(pi, goal);
      updateUi(ctx, goal);
      await send(pi, ctx, startingPrompt(goal));
    },
  });

  pi.registerTool({
    name: "create_goal",
    label: "Create Goal",
    description:
      "Create a persistent goal only when the user explicitly requests one. Refuses to replace unfinished work.",
    promptSnippet: "Start a persistent goal with independent completion evaluation",
    promptGuidelines: [
      "Use create_goal only when the user explicitly asks for persistent goal tracking.",
    ],
    parameters: Type.Object({
      objective: Type.String({
        minLength: 1,
        description: "The concrete condition that makes the goal complete",
      }),
      token_budget: Type.Optional(
        Type.Integer({ minimum: 1, description: "Optional token budget" }),
      ),
      max_turns: Type.Optional(
        Type.Integer({ minimum: 1, description: "Optional maximum goal turns" }),
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (goal && goal.status !== "complete")
        return result(
          `Goal creation rejected: an unfinished goal is already ${goal.status}. Continue it, or ask the user to clear or explicitly replace it with /goal.`,
        );
      goal = createGoalState({
        objective: params.objective,
        tokenBudget: params.token_budget ?? options.defaultTokenBudget,
        maxTurns: params.max_turns ?? options.defaultMaxTurns,
        now: goalStartTime(ctx),
      });
      saveState(pi, goal);
      updateUi(ctx, goal);
      return result(
        `Goal created. Continue working toward it until complete or genuinely blocked.\n${JSON.stringify(goal, null, 2)}`,
        goal,
      );
    },
  });

  pi.registerTool({
    name: "get_goal",
    label: "Get Goal",
    description: "Get the current persistent goal, status, budgets, usage, and evaluator reason.",
    parameters: Type.Object({}),
    async execute() {
      return result(
        goal
          ? JSON.stringify({ goal, remainingTokens: remainingTokens(goal) ?? null }, null, 2)
          : JSON.stringify({ goal: null }),
      );
    },
  });

  pi.registerTool({
    name: "update_goal",
    label: "Update Goal",
    description:
      "Claim completion for independent verification, or mark a repeated external blocker after at least three goal turns.",
    parameters: Type.Object({
      status: StringEnum(["complete", "blocked"] as const),
      reason: Type.String({
        minLength: 1,
        description: "Evidence for completion or the exact repeated blocker",
      }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (!goal) return result("No goal exists for this session.");
      if (goal.status !== "active")
        return result(`The goal is ${goal.status}, so it cannot be updated by the model.`);
      if (params.status === "blocked") {
        if (goal.turns < 2)
          return result(
            `Blocked status rejected: only ${goal.turns + 1} goal turn(s) have run. The same blocker must recur for at least three turns.`,
          );
        goal = { ...goal, status: "blocked", updatedAt: Date.now(), lastReason: params.reason };
        saveState(pi, goal);
        updateUi(ctx, goal);
        return result(JSON.stringify(goal, null, 2), goal);
      }
      goal = {
        ...goal,
        updatedAt: Date.now(),
        completionClaim: { reason: params.reason, createdAt: Date.now() },
      };
      saveState(pi, goal);
      return result(
        "Completion claim recorded. An independent evaluator will verify it when this turn ends.",
        goal,
      );
    },
  });

  pi.on("agent_end", async (event, ctx) => {
    if (!goal || goal.status !== "active" || !assistantWasInterrupted(event.messages)) return;
    goal = {
      ...goal,
      status: "paused",
      updatedAt: Date.now(),
      lastReason: "Paused because the session was interrupted.",
    };
    saveState(pi, goal);
    updateUi(ctx, goal);
    ctx.ui.notify("Goal paused after interruption.", "warning");
  });

  pi.on("agent_settled", async (_event, ctx) => {
    if (!goal || goal.status !== "active" || processing) return;
    const branch = ctx.sessionManager.getBranch();
    const assistant = latestAssistantEntry(branch, goal);
    if (!assistant || assistant.id === goal.lastEvaluatedEntryId) return;
    processing = true;
    try {
      const evaluatedGoalId = goal.goalId;
      goal = {
        ...goal,
        turns: goal.turns + 1,
        tokensUsed: goalTokens(branch, goal),
        updatedAt: Date.now(),
        lastEvaluatedEntryId: assistant.id,
      };
      saveState(pi, goal);
      updateUi(ctx, goal);
      const decision = await evaluateGoal(ctx, goal, options);
      if (!goal || goal.goalId !== evaluatedGoalId || goal.status !== "active") return;
      if (decision.error) {
        goal = {
          ...goal,
          status: "paused",
          updatedAt: Date.now(),
          lastReason: decision.reason,
          completionClaim: undefined,
        };
        saveState(pi, goal);
        updateUi(ctx, goal);
        ctx.ui.notify(`Goal paused: ${decision.reason}`, "error");
        return;
      }
      if (decision.complete) {
        goal = {
          ...goal,
          status: "complete",
          completedAt: Date.now(),
          updatedAt: Date.now(),
          lastReason: decision.reason,
          completionClaim: undefined,
        };
        saveState(pi, goal);
        updateUi(ctx, goal);
        ctx.ui.notify(`Goal complete: ${decision.reason}`, "info");
        return;
      }
      goal = {
        ...goal,
        updatedAt: Date.now(),
        lastReason: decision.reason,
        completionClaim: undefined,
      };
      if (goal.tokenBudget !== undefined && goal.tokensUsed >= goal.tokenBudget) {
        goal = {
          ...goal,
          status: "budget_limited",
          lastReason: `Token budget reached (${goal.tokensUsed.toLocaleString()} / ${goal.tokenBudget.toLocaleString()}). Last evaluation: ${decision.reason}`,
        };
        saveState(pi, goal);
        updateUi(ctx, goal);
        ctx.ui.notify("Goal stopped at its token budget.", "warning");
        await send(pi, ctx, budgetLimitPrompt(goal));
        return;
      }
      if (goal.maxTurns !== undefined && goal.turns >= goal.maxTurns) {
        goal = {
          ...goal,
          status: "turn_limited",
          lastReason: `Turn budget reached (${goal.turns} / ${goal.maxTurns}). Last evaluation: ${decision.reason}`,
        };
        saveState(pi, goal);
        updateUi(ctx, goal);
        ctx.ui.notify("Goal stopped at its turn budget.", "warning");
        await send(pi, ctx, budgetLimitPrompt(goal));
        return;
      }
      saveState(pi, goal);
      updateUi(ctx, goal);
      if (options.continuationDelayMs)
        await new Promise((resolve) => setTimeout(resolve, options.continuationDelayMs));
      if (goal.goalId === evaluatedGoalId && goal.status === "active")
        await send(pi, ctx, continuationPrompt(goal));
    } finally {
      processing = false;
    }
  });
}
