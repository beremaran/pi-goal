import type { GoalCommand, GoalExtensionOptions, ResolvedGoalExtensionOptions } from "./types.js";

const DEFAULT_MAX_TRANSCRIPT_CHARS = 48_000;

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function resolveOptions(raw: unknown): ResolvedGoalExtensionOptions {
  const input = (raw ?? {}) as GoalExtensionOptions;
  const result: ResolvedGoalExtensionOptions = {
    maxTranscriptChars: Math.max(
      positiveInteger(input.maxTranscriptChars) ?? DEFAULT_MAX_TRANSCRIPT_CHARS,
      1_024,
    ),
    continuationDelayMs: nonNegativeInteger(input.continuationDelayMs) ?? 0,
  };
  const evaluatorModel = optionalString(input.evaluatorModel);
  const defaultTokenBudget = positiveInteger(input.defaultTokenBudget);
  const defaultMaxTurns = positiveInteger(input.defaultMaxTurns);
  if (evaluatorModel) result.evaluatorModel = evaluatorModel;
  if (defaultTokenBudget) result.defaultTokenBudget = defaultTokenBudget;
  if (defaultMaxTurns) result.defaultMaxTurns = defaultMaxTurns;
  return result;
}

export function parseTokenCount(raw: string): number | undefined {
  const match = raw.trim().match(/^(\d+(?:\.\d+)?)([kKmM])?$/);
  if (!match) return undefined;
  const multiplier =
    match[2]?.toLowerCase() === "k" ? 1_000 : match[2]?.toLowerCase() === "m" ? 1_000_000 : 1;
  const result = Number(match[1]) * multiplier;
  return Number.isSafeInteger(result) && result > 0 ? result : undefined;
}

export function parseGoalCommand(
  rawArguments: string,
  defaults: Pick<ResolvedGoalExtensionOptions, "defaultTokenBudget" | "defaultMaxTurns">,
): GoalCommand {
  let rest = rawArguments.trim();
  if (!rest) return { action: "status" };
  if (["help", "--help", "-h"].includes(rest)) return { action: "help" };
  if (["clear", "cancel"].includes(rest)) return { action: "clear" };
  if (rest === "pause") return { action: "pause" };
  if (rest === "resume") return { action: "resume" };

  let tokenBudget = defaults.defaultTokenBudget;
  let maxTurns = defaults.defaultMaxTurns;
  while (rest.startsWith("--")) {
    const tokenMatch = rest.match(/^--tokens(?:=|\s+)(\S+)(?:\s+|$)/);
    if (tokenMatch) {
      const parsed = parseTokenCount(tokenMatch[1] ?? "");
      if (!parsed)
        return {
          action: "invalid",
          message: "`--tokens` must be a positive integer, optionally ending in k or m.",
        };
      tokenBudget = parsed;
      rest = rest.slice(tokenMatch[0].length).trim();
      continue;
    }
    const turnsMatch = rest.match(/^--max-turns(?:=|\s+)(\S+)(?:\s+|$)/);
    if (turnsMatch) {
      const parsed = Number(turnsMatch[1]);
      if (!Number.isSafeInteger(parsed) || parsed <= 0)
        return { action: "invalid", message: "`--max-turns` must be a positive integer." };
      maxTurns = parsed;
      rest = rest.slice(turnsMatch[0].length).trim();
      continue;
    }
    return {
      action: "invalid",
      message: `Unknown goal option: ${rest.split(/\s+/, 1)[0] ?? rest}`,
    };
  }
  if (!rest) return { action: "invalid", message: "A goal needs a concrete completion condition." };
  const result: Extract<GoalCommand, { action: "set" }> = { action: "set", objective: rest };
  if (tokenBudget) result.tokenBudget = tokenBudget;
  if (maxTurns) result.maxTurns = maxTurns;
  return result;
}
