import { uuidv7, type AssistantMessage, type Model } from "@earendil-works/pi-ai";
import { complete } from "@earendil-works/pi-ai/compat";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { EVALUATOR_SYSTEM_PROMPT, evaluatorPrompt } from "./prompts.js";
import { buildTranscript } from "./transcript.js";
import type { EvaluationDecision, GoalState, ResolvedGoalExtensionOptions } from "./types.js";

export function parseEvaluation(text: string): EvaluationDecision | undefined {
  const trimmed = text.trim();
  const candidate =
    trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i)?.[1] ?? trimmed.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return undefined;
  try {
    const value = JSON.parse(candidate) as Record<string, unknown>;
    if (
      typeof value.complete !== "boolean" ||
      typeof value.reason !== "string" ||
      !value.reason.trim()
    )
      return undefined;
    return { complete: value.complete, reason: value.reason.trim() };
  } catch {
    return undefined;
  }
}

function modelFromSetting(
  value: string | undefined,
  ctx: ExtensionContext,
): Model<any> | undefined {
  if (!value) return undefined;
  const slash = value.indexOf("/");
  if (slash < 1) return undefined;
  return ctx.modelRegistry.find(value.slice(0, slash), value.slice(slash + 1));
}

function responseText(content: AssistantMessage["content"]): string {
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

export async function evaluateGoal(
  ctx: ExtensionContext,
  goal: GoalState,
  options: ResolvedGoalExtensionOptions,
): Promise<EvaluationDecision> {
  const model = modelFromSetting(options.evaluatorModel, ctx) ?? ctx.model;
  if (!model)
    return {
      complete: false,
      reason:
        "No evaluator model is available; continue and surface clearer verification evidence.",
      error: true,
    };
  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok || !auth.apiKey)
    return {
      complete: false,
      reason: auth.ok
        ? "No evaluator API key is available; continue after configuring model access."
        : auth.error,
      error: true,
    };

  try {
    const response = await complete(
      model,
      {
        systemPrompt: EVALUATOR_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: evaluatorPrompt(
                  goal,
                  buildTranscript(ctx.sessionManager.getBranch(), goal, options.maxTranscriptChars),
                ),
              },
            ],
            timestamp: Date.now(),
          },
        ],
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
        env: auth.env,
        cacheRetention: "none",
        sessionId: uuidv7(),
      },
    );
    const parsed = parseEvaluation(
      response.content.length ? responseText(response.content as AssistantMessage["content"]) : "",
    );
    return (
      parsed ?? {
        complete: false,
        reason:
          "The evaluator returned no valid decision; continue and surface explicit completion evidence.",
        error: true,
      }
    );
  } catch {
    return {
      complete: false,
      reason: "Completion evaluation failed; continue and surface explicit verification evidence.",
      error: true,
    };
  }
}
