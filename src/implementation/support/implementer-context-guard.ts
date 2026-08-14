import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  CONTEXT_GUARD_CONTINUATION,
  IMPLEMENTER_CHILD_MARKER,
  IMPLEMENTER_COMPACT_COMMAND,
  IMPLEMENTER_CONTEXT_COMPACTION_THRESHOLD_PERCENT,
  IMPLEMENTER_CONTEXT_GUARD_ENTRY,
  IMPLEMENTER_CONTEXT_GUARD_VERSION,
  type ContextUsageSnapshot,
} from "../guard.ts";

const INSTRUCTIONS = readFileSync(new URL("./implementer-context-guard.txt", import.meta.url), "utf8").trim();

type ActiveCycle = {
  cycleId: string;
  trigger: "automatic" | "manual";
  startedAt: string;
  preCompactUsage: ContextUsageSnapshot;
  continueAfterCompaction: boolean;
  done: boolean;
};

const isoNow = () => new Date().toISOString();
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

function snapshot(ctx: ExtensionContext): ContextUsageSnapshot {
  const value = ctx.getContextUsage();
  const tokens = typeof value?.tokens === "number" && Number.isFinite(value.tokens) ? value.tokens : null;
  const contextWindow = typeof value?.contextWindow === "number" && Number.isFinite(value.contextWindow) ? value.contextWindow : null;
  const reportedPercent = typeof value?.percent === "number" && Number.isFinite(value.percent) ? value.percent : null;
  const percent = reportedPercent ?? (tokens !== null && contextWindow && contextWindow > 0 ? (tokens / contextWindow) * 100 : null);
  return { tokens, contextWindow, percent };
}

export default function implementerContextGuard(pi: ExtensionAPI): void {
  if (process.env.HERDR_ENV !== "1" || process.env[IMPLEMENTER_CHILD_MARKER] !== "1") return;

  let active: ActiveCycle | undefined;
  const append = (cycle: ActiveCycle, state: "started" | "completed" | "failed", timestamp: string, error?: string) => {
    pi.appendEntry(IMPLEMENTER_CONTEXT_GUARD_ENTRY, {
      version: IMPLEMENTER_CONTEXT_GUARD_VERSION,
      cycleId: cycle.cycleId,
      trigger: cycle.trigger,
      state,
      timestamp,
      startedAt: cycle.startedAt,
      preCompactUsage: cycle.preCompactUsage,
      ...(state === "completed" ? { completedAt: timestamp } : {}),
      ...(state === "failed" ? { failedAt: timestamp, ...(error ? { error } : {}) } : {}),
    });
  };

  const start = (ctx: ExtensionContext, trigger: "automatic" | "manual", continueAfterCompaction: boolean): boolean => {
    if (active) return false;
    const startedAt = isoNow();
    const cycle: ActiveCycle = {
      cycleId: randomUUID(),
      trigger,
      startedAt,
      preCompactUsage: snapshot(ctx),
      continueAfterCompaction,
      done: false,
    };
    active = cycle;
    append(cycle, "started", startedAt);

    const finish = (state: "completed" | "failed", error?: unknown) => {
      if (cycle.done) return;
      cycle.done = true;
      if (state === "completed" && cycle.continueAfterCompaction) {
        try {
          pi.sendUserMessage(CONTEXT_GUARD_CONTINUATION);
        } catch (queueError) {
          active = undefined;
          append(cycle, "failed", isoNow(), errorText(queueError));
          return;
        }
      }
      active = undefined;
      append(cycle, state, isoNow(), error === undefined ? undefined : errorText(error));
    };

    try {
      ctx.compact({ customInstructions: INSTRUCTIONS, onComplete: () => finish("completed"), onError: (error) => finish("failed", error) });
    } catch (error) {
      finish("failed", error);
    }
    return true;
  };

  pi.on("turn_end", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    const value = snapshot(ctx);
    if (value.percent === null || value.percent < IMPLEMENTER_CONTEXT_COMPACTION_THRESHOLD_PERCENT) return;
    start(ctx, "automatic", event.message.stopReason === "toolUse" || event.message.stopReason === "length");
  });

  pi.registerCommand(IMPLEMENTER_COMPACT_COMMAND, {
    description: "Compact this Pinot implementer child without starting a new assignment",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) throw new Error(`/${IMPLEMENTER_COMPACT_COMMAND} is available only while the child is idle.`);
      start(ctx, "manual", false);
    },
  });
}
