import { calculateContextTokens } from "@earendil-works/pi-coding-agent";
import type { Usage } from "@earendil-works/pi-ai";

export const IMPLEMENTER_CONTEXT_GUARD_ENTRY = "pinot-implementer-context-guard";
export const IMPLEMENTER_CONTEXT_GUARD_VERSION = 1 as const;
export const IMPLEMENTER_CONTEXT_COMPACTION_THRESHOLD_PERCENT = 70;
export const IMPLEMENTER_CHILD_MARKER = "PINOT_IMPLEMENTER_CHILD";
export const IMPLEMENTER_LIFECYCLE_OWNER_MARKER = "PINOT_HERDR_LIFECYCLE_OWNER_PID";
export const IMPLEMENTER_COMPACT_COMMAND = "pinot-implementer-compact";
export const CONTEXT_GUARD_CONTINUATION =
  "Continue the same bounded implementation assignment. Finish the remaining work, run the focused verification, and write the required checkpoint. Do not start a new assignment.";

export type GuardTrigger = "automatic" | "manual";
export type GuardState = "started" | "completed" | "failed";

export interface ContextUsageSnapshot {
  tokens: number | null;
  contextWindow: number | null;
  percent: number | null;
}

export interface ImplementerContextGuardCycle {
  version: typeof IMPLEMENTER_CONTEXT_GUARD_VERSION;
  cycleId: string;
  trigger: GuardTrigger;
  state: GuardState;
  timestamp: string;
  startedAt: string;
  preCompactUsage: ContextUsageSnapshot;
  completedAt?: string;
  failedAt?: string;
  error?: string;
}

export interface GuardSummary {
  version: typeof IMPLEMENTER_CONTEXT_GUARD_VERSION;
  entry: typeof IMPLEMENTER_CONTEXT_GUARD_ENTRY;
  thresholdPercent: number;
  latest: ImplementerContextGuardCycle | null;
  pending: boolean;
  pendingCycleIds: string[];
  outcome: "none" | "pending" | "completed" | "failed" | "unknown";
  reason?: string;
}

export interface GuardBaseline {
  actionStartedAt: number;
  cycleIds: Set<string>;
  pendingCycleIds: Set<string>;
}

function jsonlEntries(jsonl: string): unknown[] {
  const entries: unknown[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // A session can end with a partial line while Pi is writing it.
    }
  }
  return entries;
}

function cycleTime(cycle: ImplementerContextGuardCycle): number {
  return Date.parse(cycle.startedAt) || Date.parse(cycle.timestamp) || 0;
}

function isGuardCycle(value: unknown): value is ImplementerContextGuardCycle {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.version === IMPLEMENTER_CONTEXT_GUARD_VERSION
    && typeof record.cycleId === "string"
    && (record.trigger === "automatic" || record.trigger === "manual")
    && (record.state === "started" || record.state === "completed" || record.state === "failed")
    && typeof record.timestamp === "string"
    && typeof record.startedAt === "string";
}

export function guardCyclesFromJsonl(jsonl: string): ImplementerContextGuardCycle[] {
  const cycles = new Map<string, ImplementerContextGuardCycle>();
  for (const entry of jsonlEntries(jsonl)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const data = record.type === "custom" && record.customType === IMPLEMENTER_CONTEXT_GUARD_ENTRY
      ? record.data
      : undefined;
    if (isGuardCycle(data)) cycles.set(data.cycleId, data);
  }
  return [...cycles.values()].sort((left, right) => cycleTime(left) - cycleTime(right));
}

export function summarizeGuard(cycles: ImplementerContextGuardCycle[], reason?: string): GuardSummary {
  const pending = cycles.filter((cycle) => cycle.state === "started");
  const latest = cycles.at(-1) ?? null;
  const outcome = pending.length
    ? "pending"
    : latest?.state === "completed"
      ? "completed"
      : latest?.state === "failed"
        ? "failed"
        : reason
          ? "unknown"
          : "none";
  return {
    version: IMPLEMENTER_CONTEXT_GUARD_VERSION,
    entry: IMPLEMENTER_CONTEXT_GUARD_ENTRY,
    thresholdPercent: IMPLEMENTER_CONTEXT_COMPACTION_THRESHOLD_PERCENT,
    latest,
    pending: pending.length > 0,
    pendingCycleIds: pending.map((cycle) => cycle.cycleId),
    outcome,
    ...(reason ? { reason } : {}),
  };
}

export function usageTokens(usage: unknown): number | undefined {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return undefined;
  const values = usage as Record<string, unknown>;
  const number = (key: string): number | undefined => {
    const value = values[key];
    if (value === undefined) return 0;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  const input = number("input");
  const output = number("output");
  const cacheRead = number("cacheRead");
  const cacheWrite = number("cacheWrite");
  const totalTokens = number("totalTokens");
  if ([input, output, cacheRead, cacheWrite, totalTokens].some((value) => value === undefined)) return undefined;
  const tokens = calculateContextTokens({ input, output, cacheRead, cacheWrite, totalTokens } as Usage);
  return Number.isFinite(tokens) && tokens > 0 ? tokens : undefined;
}

export function estimateChildContextFromJsonl(jsonl: string): { tokens: number | null; reason?: string } {
  let latestUsage: number | undefined;
  let crossedCompaction = false;
  for (const entry of jsonlEntries(jsonl)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (record.type === "compaction" || record.type === "branch_summary") {
      latestUsage = undefined;
      crossedCompaction = true;
      continue;
    }
    const message = record.type === "message" && record.message && typeof record.message === "object"
      ? record.message as Record<string, unknown>
      : undefined;
    if (message?.role !== "assistant") continue;
    if (message.stopReason === "aborted" || message.stopReason === "error") {
      latestUsage = undefined;
      continue;
    }
    const tokens = usageTokens(message.usage);
    if (tokens !== undefined) latestUsage = tokens;
  }
  return latestUsage === undefined
    ? { tokens: null, reason: crossedCompaction ? "post-compaction assistant usage unavailable" : "successful assistant usage unavailable" }
    : { tokens: latestUsage };
}

export function contextSnapshot(value: { tokens?: unknown; contextWindow?: unknown; percent?: unknown } | undefined): ContextUsageSnapshot {
  const tokens = typeof value?.tokens === "number" && Number.isFinite(value.tokens) ? value.tokens : null;
  const contextWindow = typeof value?.contextWindow === "number" && Number.isFinite(value.contextWindow) ? value.contextWindow : null;
  const reportedPercent = typeof value?.percent === "number" && Number.isFinite(value.percent) ? value.percent : null;
  const percent = reportedPercent ?? (tokens !== null && contextWindow && contextWindow > 0 ? (tokens / contextWindow) * 100 : null);
  return { tokens, contextWindow, percent };
}

export function guardCycleTime(cycle: ImplementerContextGuardCycle): number {
  return cycleTime(cycle);
}