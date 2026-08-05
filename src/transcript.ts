import type { GoalState } from "./types.js";

type ContentPart = {
  type?: string;
  text?: string;
  name?: string;
  arguments?: unknown;
  [key: string]: unknown;
};
type SessionEntry = {
  type: string;
  id: string;
  timestamp: string;
  message?: {
    role?: string;
    content?: unknown;
    usage?: {
      input?: number;
      output?: number;
      cacheRead?: number;
      cacheWrite?: number;
      totalTokens?: number;
    };
    timestamp?: number;
    isError?: boolean;
    toolName?: string;
    details?: unknown;
  };
};

export function sessionEntries(branch: readonly unknown[]): SessionEntry[] {
  return branch.filter((entry): entry is SessionEntry => {
    if (!entry || typeof entry !== "object") return false;
    const value = entry as Record<string, unknown>;
    return (
      value.type === "message" &&
      typeof value.id === "string" &&
      typeof value.timestamp === "string"
    );
  });
}

function textFromContent(content: unknown): string[] {
  if (typeof content === "string" && content.trim()) return [content.trim()];
  if (!Array.isArray(content)) return [];
  const result: string[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== "object") continue;
    const part = raw as ContentPart;
    if (part.type === "text" && typeof part.text === "string" && part.text.trim())
      result.push(part.text.trim());
    if (part.type === "toolCall" && typeof part.name === "string")
      result.push(`[tool call ${part.name}] ${JSON.stringify(part.arguments ?? {})}`);
  }
  return result;
}

function messageTimestamp(entry: SessionEntry): number {
  const timestamp = entry.message?.timestamp;
  return typeof timestamp === "number" ? timestamp : Date.parse(entry.timestamp);
}

export function buildTranscript(
  branch: readonly unknown[],
  goal: GoalState,
  maxCharacters: number,
): string {
  const rendered = sessionEntries(branch)
    .filter((entry) => messageTimestamp(entry) >= goal.createdAt)
    .flatMap((entry) => {
      const role = entry.message?.role;
      if (!role || !entry.message) return [];
      const lines = textFromContent(entry.message.content);
      if (role === "toolResult") {
        const details = entry.message.details as { output?: string; error?: string } | undefined;
        if (details?.output) lines.push(`[tool output] ${details.output}`);
        if (details?.error) lines.push(`[tool error] ${details.error}`);
      }
      return lines.length ? [`[${role}]\n${lines.join("\n")}`] : [];
    })
    .join("\n\n");
  if (rendered.length <= maxCharacters) return rendered;
  const marker = "[Earlier goal transcript omitted]\n\n";
  return marker + rendered.slice(-(maxCharacters - marker.length));
}

export function latestAssistantEntry(
  branch: readonly unknown[],
  goal: GoalState,
): SessionEntry | undefined {
  return sessionEntries(branch)
    .filter(
      (entry) => entry.message?.role === "assistant" && messageTimestamp(entry) >= goal.createdAt,
    )
    .at(-1);
}

export function goalTokens(branch: readonly unknown[], goal: GoalState): number {
  return sessionEntries(branch)
    .filter(
      (entry) => entry.message?.role === "assistant" && messageTimestamp(entry) >= goal.createdAt,
    )
    .reduce((total, entry) => {
      const usage = entry.message?.usage;
      if (!usage) return total;
      // Cache reads/writes are deliberately excluded from the goal budget.
      return total + (usage.input ?? 0) + (usage.output ?? 0);
    }, 0);
}

export function assistantWasInterrupted(messages: readonly unknown[]): boolean {
  return messages.some((message) => {
    if (!message || typeof message !== "object") return false;
    const value = message as { role?: string; stopReason?: string };
    return (
      value.role === "assistant" && (value.stopReason === "aborted" || value.stopReason === "error")
    );
  });
}
