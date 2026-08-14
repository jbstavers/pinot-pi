import { spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { boundTailText } from "./limits.ts";

export type ProgressPhase = "starting" | "thinking" | "tool" | "retry" | "reporting";
export type ProcessOutcome = "completed" | "timed_out" | "cancelled" | "spawn_failed" | "exited_nonzero";

export interface WorkerUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
  turns: number;
  contextTokens?: number;
  contextWindow?: number;
}

export interface WorkerProgress {
  elapsedMs: number;
  lastActivityElapsedMs: number;
  phase: ProgressPhase;
  currentTool?: string;
  turns: number;
  usage: WorkerUsage;
}

export type ProcessClosure = "child_close" | "error_settlement" | "forced_after_kill_unconfirmed" | "pre_spawn";

export interface WorkerProcessInfo {
  outcome: ProcessOutcome;
  deadlineMs: number;
  shutdownMs?: number;
  killAttempted: boolean;
  closure: ProcessClosure;
  exitCode?: number;
}

export interface WorkerProcessResult {
  terminalText: string;
  usage: WorkerUsage;
  progress: WorkerProgress;
  process: WorkerProcessInfo;
}

interface SpawnedChild {
  stdout: ChildProcess["stdout"];
  stderr: ChildProcess["stderr"];
  on(event: string, listener: (...args: any[]) => void): ChildProcess;
  kill(signal?: NodeJS.Signals | number): boolean;
  removeListener(event: string, listener: (...args: any[]) => void): ChildProcess;
}

export interface WorkerProcessOptions {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  deadlineMs: number;
  signal?: AbortSignal;
  heartbeatMs?: number;
  shutdownGraceMs?: number;
  now?: () => number;
  spawnProcess?: (executable: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; stdio: ["ignore", "pipe", "pipe"]; shell: false }) => SpawnedChild;
  onProgress?: (progress: WorkerProgress) => void;
}

const MAX_DIAGNOSTIC = 300;
const MAX_JSON_LINE = 128 * 1024;

function emptyUsage(): WorkerUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0, turns: 0 };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function textFromMessage(message: any): string {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part: any) => part?.type === "text" && typeof part.text === "string").map((part: any) => part.text).join("");
}

function usageSignature(usage: WorkerUsage): string {
  return [usage.input, usage.output, usage.cacheRead, usage.cacheWrite, usage.totalTokens, usage.cost, usage.turns].join("/");
}

export function formatProgress(progress: WorkerProgress): string {
  const tool = progress.currentTool ? ` currentTool=${progress.currentTool}` : "";
  return `elapsedMs=${progress.elapsedMs} lastActivityElapsedMs=${progress.lastActivityElapsedMs} phase=${progress.phase}${tool} turns=${progress.turns} usage=${JSON.stringify(progress.usage)}`;
}

/** Run one child with a hard deadline and bounded JSONL/stdout handling. */
export async function runWorkerProcess(options: WorkerProcessOptions): Promise<WorkerProcessResult> {
  const now = options.now ?? Date.now;
  const heartbeatMs = options.heartbeatMs ?? 30_000;
  const shutdownGraceMs = options.shutdownGraceMs ?? 5_000;
  const startedAt = now();
  const usage = emptyUsage();
  let progress: WorkerProgress = { elapsedMs: 0, lastActivityElapsedMs: 0, phase: "starting", turns: 0, usage };
  let terminalText = "";
  let lineBuffer = "";
  let droppingLongLine = false;
  let lastActivityAt = startedAt;
  let lastMeaningful = "starting///" + usageSignature(usage);
  let settled = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let graceTimer: ReturnType<typeof setTimeout> | undefined;
  let postKillTimer: ReturnType<typeof setTimeout> | undefined;
  let child: SpawnedChild | undefined;
  let termination: "timed_out" | "cancelled" | undefined;
  let termRequestedAt: number | undefined;
  let killAttempted = false;
  let closure: ProcessClosure = "pre_spawn";
  let exitCode: number | undefined;
  let stdoutListener: ((chunk: Buffer | string) => void) | undefined;
  let stderrListener: (() => void) | undefined;
  let errorListener: (() => void) | undefined;
  let closeListener: ((code: number | null) => void) | undefined;
  let resolveResult!: (result: WorkerProcessResult) => void;
  const resultPromise = new Promise<WorkerProcessResult>((resolve) => { resolveResult = resolve; });

  const snapshot = (timestamp = now()): WorkerProgress => ({
    elapsedMs: Math.max(0, timestamp - startedAt),
    lastActivityElapsedMs: Math.max(0, timestamp - lastActivityAt),
    phase: progress.phase,
    ...(progress.currentTool ? { currentTool: progress.currentTool } : {}),
    turns: usage.turns,
    usage: { ...usage },
  });
  const emitProgress = (force = false) => {
    const next = snapshot();
    const meaningful = [next.phase, next.currentTool ?? "", next.turns, usageSignature(next.usage)].join("/");
    if (!force && meaningful === lastMeaningful) return;
    lastMeaningful = meaningful;
    progress = next;
    options.onProgress?.(next);
  };
  const cleanup = () => {
    if (heartbeat) clearInterval(heartbeat);
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (graceTimer) clearTimeout(graceTimer);
    if (postKillTimer) clearTimeout(postKillTimer);
    options.signal?.removeEventListener("abort", cancel);
    if (child) {
      if (stdoutListener) child.stdout?.removeListener("data", stdoutListener);
      if (stderrListener) child.stderr?.removeListener("data", stderrListener);
      if (errorListener) child.removeListener("error", errorListener);
      if (closeListener) child.removeListener("close", closeListener);
    }
    heartbeat = undefined;
    deadlineTimer = undefined;
    graceTimer = undefined;
    postKillTimer = undefined;
  };
  const settle = (outcome: ProcessOutcome, code?: number) => {
    if (settled) return;
    settled = true;
    if (typeof code === "number") exitCode = code;
    cleanup();
    progress = snapshot(now());
    resolveResult({
      terminalText,
      usage: { ...usage },
      progress,
      process: {
        outcome,
        deadlineMs: options.deadlineMs,
        ...(termRequestedAt === undefined ? {} : { shutdownMs: Math.max(0, now() - termRequestedAt) }),
        killAttempted,
        closure,
        ...(exitCode === undefined ? {} : { exitCode }),
      },
    });
  };
  const requestTermination = (kind: "timed_out" | "cancelled") => {
    if (settled || termination) return;
    termination = kind;
    termRequestedAt = now();
    try { child?.kill("SIGTERM"); } catch { /* forced settlement remains authoritative */ }
    graceTimer = setTimeout(() => {
      if (settled) return;
      killAttempted = true;
      try { child?.kill("SIGKILL"); } catch { /* attempted settlement remains authoritative */ }
      postKillTimer = setTimeout(() => {
        if (!settled) {
          closure = "forced_after_kill_unconfirmed";
          settle(termination ?? "timed_out", undefined);
        }
      }, Math.max(25, Math.min(250, shutdownGraceMs)));
    }, shutdownGraceMs);
  };
  function cancel() { requestTermination("cancelled"); }
  const recordUsage = (message: any) => {
    usage.turns++;
    const eventUsage = message?.usage ?? {};
    for (const key of ["input", "output", "cacheRead", "cacheWrite", "totalTokens"] as const) {
      const value = finiteNumber(eventUsage[key]);
      if (value !== undefined) usage[key] += value;
    }
    const cost = finiteNumber(eventUsage.cost?.total);
    if (cost !== undefined) usage.cost += cost;
    const contextTokens = finiteNumber(eventUsage.contextTokens);
    const contextWindow = finiteNumber(eventUsage.contextWindow);
    if (contextTokens !== undefined) usage.contextTokens = contextTokens;
    if (contextWindow !== undefined) usage.contextWindow = contextWindow;
  };
  const touch = (phase?: ProgressPhase, currentTool?: string) => {
    lastActivityAt = now();
    if (phase) progress.phase = phase;
    progress.currentTool = currentTool;
    emitProgress();
  };
  const handleEvent = (event: any) => {
    if (!event || typeof event !== "object" || typeof event.type !== "string") return;
    switch (event.type) {
      case "agent_start": case "turn_start": case "message_start": case "message_update": case "model_select": touch("thinking"); break;
      case "tool_execution_start": case "tool_execution_update": touch("tool", typeof event.toolName === "string" ? event.toolName : undefined); break;
      case "tool_execution_end": touch("thinking"); break;
      case "auto_retry_start": case "auto_retry_end": touch("retry"); break;
      case "compaction_start": case "compaction_end": case "agent_end": touch("reporting"); break;
      case "message_end":
        if (event.message?.role === "assistant") {
          recordUsage(event.message);
          terminalText = boundTailText(terminalText + textFromMessage(event.message));
          touch("thinking");
        }
        break;
      default: return;
    }
    if (event.type === "agent_end" && Array.isArray(event.messages)) {
      for (const message of event.messages) if (message?.role === "assistant") terminalText = boundTailText(terminalText + textFromMessage(message));
    }
  };
  const feed = (chunk: Buffer | string) => {
    lineBuffer += String(chunk);
    for (;;) {
      const newline = lineBuffer.indexOf("\n");
      if (newline < 0) {
        if (lineBuffer.length > MAX_JSON_LINE) { lineBuffer = ""; droppingLongLine = true; }
        return;
      }
      const line = lineBuffer.slice(0, newline);
      lineBuffer = lineBuffer.slice(newline + 1);
      if (droppingLongLine) { droppingLongLine = false; continue; }
      if (line.length > MAX_JSON_LINE) continue;
      try { handleEvent(JSON.parse(line)); } catch { /* Unknown output never reaches the parent. */ }
    }
  };

  if (options.signal?.aborted) { settle("cancelled"); return resultPromise; }
  options.onProgress?.(progress);
  options.signal?.addEventListener("abort", cancel, { once: true });
  heartbeat = setInterval(() => emitProgress(true), heartbeatMs);
  const spawnProcess = options.spawnProcess ?? ((executable, args, spawnOptions) => nodeSpawn(executable, args, spawnOptions));
  try {
    child = spawnProcess(options.executable, options.args, { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"], shell: false });
    closure = "pre_spawn";
    stdoutListener = (chunk: Buffer | string) => feed(chunk);
    stderrListener = () => { /* Diagnostics are intentionally not forwarded. */ };
    errorListener = () => { if (!termination) { closure = "error_settlement"; settle("spawn_failed"); } };
    closeListener = (code: number | null) => {
      if (settled) return;
      closure = "child_close";
      if (termination) settle(termination, code === null ? undefined : code);
      else if (code === 0) settle("completed", 0);
      else settle("exited_nonzero", code === null ? undefined : code);
    };
    child.stdout?.on("data", stdoutListener);
    child.stderr?.on("data", stderrListener);
    child.on("error", errorListener);
    child.on("close", closeListener);
    const remaining = Math.max(0, options.deadlineMs - (now() - startedAt));
    deadlineTimer = setTimeout(() => requestTermination("timed_out"), remaining);
  } catch {
    closure = "error_settlement";
    settle("spawn_failed");
  }
  return resultPromise;
}
