import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { lstat, mkdir, realpath, stat } from "node:fs/promises";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { finished } from "node:stream/promises";
import { promisify } from "node:util";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { resolveStatePaths } from "../state/paths.ts";

export const TEST_SUITE_MAX_TIMEOUT_MS = 3_600_000;
export const TEST_SUITE_DEFAULT_LOG_DIRECTORY = "+test-output";
const execFile = promisify(execFileCallback);

export const TestSuiteSchema = Type.Object({
  cwd: Type.String({ description: "Exact absolute project directory in which to run the command." }),
  command: Type.String({ minLength: 1, description: "Exact test command to execute." }),
  timeoutMs: Type.Integer({ minimum: 1_000, maximum: TEST_SUITE_MAX_TIMEOUT_MS, description: "Bounded timeout in milliseconds." }),
  label: Type.String({ minLength: 1, maxLength: 64, description: "Log-safe label using letters, numbers, underscore, or hyphen." }),
  logRoot: Type.Optional(Type.String({ description: "Optional absolute log directory inside the project or Pinot state root." })),
}, { additionalProperties: false });
export type TestSuiteInput = Static<typeof TestSuiteSchema>;

export interface TestSuiteDetails {
  status: "pass" | "fail" | "timeout" | "cancel";
  passed: boolean;
  durationMs: number;
  logFile: string;
  logLocation: string;
  timedOut: boolean;
  cancelled: boolean;
  exitCode: number | null;
}

export interface TestSuiteResult {
  text: string;
  details: TestSuiteDetails;
}

/** Tokenize one exact executable command without invoking a shell. */
export function tokenizeExactCommand(command: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let quote: "single" | "double" | undefined;
  let escaped = false;
  let started = false;
  for (const character of command) {
    if (escaped) {
      token += character;
      started = true;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      started = true;
      continue;
    }
    if (quote === "single") {
      if (character === "'") quote = undefined;
      else token += character;
      started = true;
      continue;
    }
    if (quote === "double") {
      if (character === '"') quote = undefined;
      else token += character;
      started = true;
      continue;
    }
    if (character === "'") {
      quote = "single";
      started = true;
      continue;
    }
    if (character === '"') {
      quote = "double";
      started = true;
      continue;
    }
    if (/\s/u.test(character)) {
      if (started) {
        tokens.push(token);
        token = "";
        started = false;
      }
      continue;
    }
    if (";|&<>`$(){}!".includes(character)) {
      throw new Error("command contains shell syntax; provide one executable and its literal arguments instead.");
    }
    token += character;
    started = true;
  }
  if (escaped || quote) throw new Error("command contains an unfinished escape or quote.");
  if (started) tokens.push(token);
  if (tokens.length === 0) throw new Error("command must contain an executable.");
  return tokens;
}

interface CommandResult {
  code: number | null;
  spawnError?: Error;
  timedOut: boolean;
  cancelled: boolean;
}

function safeLabel(label: string): string {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(label)) {
    throw new Error("label must use letters, numbers, _ or -, and be at most 64 characters.");
  }
  return label;
}

function isWithin(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

async function canonicalExistingDirectory(path: string, label: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error(`${label} must be an absolute directory.`);
  const canonical = await realpath(resolve(path));
  if (!(await stat(canonical)).isDirectory()) throw new Error(`${label} is not a directory.`);
  return canonical;
}

function assertSafeLogRoot(info: { uid?: number | bigint; mode: number | bigint }): void {
  const currentUid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (currentUid !== undefined && info.uid !== undefined && Number(info.uid) !== currentUid) throw new Error("Refusing test log root not owned by the current user.");
  if ((Number(info.mode) & 0o7777) !== 0o700) throw new Error("Refusing test log root with unsafe permissions.");
}

async function nearestExistingParent(path: string): Promise<{ lexical: string; canonical: string }> {
  let candidate = resolve(path);
  for (;;) {
    try {
      const info = await lstat(candidate);
      if (info.isSymbolicLink()) throw new Error("Refusing symlink in test log path.");
      if (!info.isDirectory()) throw new Error("Test log path parent is not a directory.");
      return { lexical: candidate, canonical: await realpath(candidate) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = resolve(candidate, "..");
      if (parent === candidate) throw new Error("Cannot find a safe parent for test log path.");
      candidate = parent;
    }
  }
}

async function gitIgnoredProjectPath(cwd: string, candidate: string): Promise<boolean> {
  const relativePath = relative(cwd, candidate);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) return false;
  const check = async (path: string): Promise<boolean> => {
    try {
      const result = await execFile("git", ["-C", cwd, "check-ignore", "--no-index", "--", path], {
        encoding: "utf8",
        timeout: 5_000,
        maxBuffer: 4_096,
      });
      return result.stdout.trim().length > 0;
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (code === 1 || code === "1") return false;
      throw new Error("Project log root Git-ignore status could not be verified.");
    }
  };
  if (await check(relativePath)) return true;
  return relativePath.endsWith("/") ? false : check(`${relativePath}/`);
}

function logicalPath(relativePath: string, file: string): string {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
  const prefix = normalized && normalized !== "." ? `${normalized}/` : "";
  return `${prefix}${file}`;
}

async function logicalLogLocation(cwd: string, logRoot: string, logFile: string): Promise<string> {
  if (isWithin(cwd, logRoot)) return logicalPath(relative(cwd, logRoot), logFile);
  try {
    const stateRoot = await canonicalExistingDirectory(resolveStatePaths().root, "Pinot state root");
    if (isWithin(stateRoot, logRoot)) return logicalPath(`pinot-state/${relative(stateRoot, logRoot)}`, logFile);
  } catch { /* The resolved root was already validated before a log is written. */ }
  return logicalPath("pinot-state", logFile);
}

export async function resolveTestLogRoot(cwdInput: string, logRootInput?: string): Promise<string> {
  const cwd = await canonicalExistingDirectory(cwdInput, "cwd");
  const stateRootCandidate = resolveStatePaths().root;
  const allowedRoots = [cwd];
  try { allowedRoots.push(await canonicalExistingDirectory(stateRootCandidate, "Pinot state root")); } catch { /* State may not be initialized yet. */ }
  const requested = logRootInput === undefined ? join(cwd, TEST_SUITE_DEFAULT_LOG_DIRECTORY) : logRootInput;
  if (!isAbsolute(requested)) throw new Error("logRoot must be an absolute directory when supplied.");
  const resolved = resolve(requested);
  const parent = await nearestExistingParent(resolved);
  const canonicalResolved = resolve(parent.canonical, relative(parent.lexical, resolved));
  if (!allowedRoots.some((root) => isWithin(root, canonicalResolved))) {
    throw new Error("logRoot must remain inside the selected project cwd or Pinot state root.");
  }
  const projectRoot = allowedRoots.find((root) => root === cwd && isWithin(root, canonicalResolved));
  const stateRoot = allowedRoots.find((root) => root !== cwd && isWithin(root, canonicalResolved));
  if (projectRoot && !stateRoot && !(await gitIgnoredProjectPath(cwd, canonicalResolved))) {
    throw new Error("Project logRoot must be Git-ignored before use.");
  }
  try {
    await mkdir(resolved, { recursive: true, mode: 0o700 });
  } catch {
    throw new Error("Unable to create the safe test log root.");
  }
  let info;
  try { info = await lstat(resolved); } catch { throw new Error("Unable to inspect the test log root."); }
  if (info.isSymbolicLink()) throw new Error("Refusing symlink test log root.");
  if (!info.isDirectory()) throw new Error("logRoot is not a directory.");
  assertSafeLogRoot(info);
  const canonical = await realpath(resolved);
  const canonicalStateRoot = allowedRoots.find((root) => root !== cwd && isWithin(root, canonical));
  if (!canonicalStateRoot && isWithin(cwd, canonical) && !(await gitIgnoredProjectPath(cwd, canonical))) {
    throw new Error("Project logRoot Git-ignore status changed before use.");
  }
  if (!allowedRoots.some((root) => isWithin(root, canonical))) throw new Error("logRoot resolves outside the selected project cwd or Pinot state root.");
  return canonical;
}

function killGroup(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
  if (!child.pid) return;
  try { process.kill(-child.pid, signal); } catch {
    try { child.kill(signal); } catch { /* Settlement remains bounded below. */ }
  }
}

async function runCommand(command: string, cwd: string, logPath: string, timeoutMs: number, signal?: AbortSignal): Promise<CommandResult> {
  const argv = tokenizeExactCommand(command);
  const stream = createWriteStream(logPath, { flags: "wx", mode: 0o600 });
  let timedOut = false;
  let cancelled = false;
  let settled = false;
  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  let termTimer: ReturnType<typeof setTimeout> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const append = (chunk: Buffer | string) => {
    stream.write(chunk);
  };
  const child = spawn(argv[0], argv.slice(1), {
    cwd,
    detached: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", append);
  child.stderr?.on("data", append);

  const result = await new Promise<{ code: number | null; spawnError?: Error }>((resolveResult) => {
    const settle = (code: number | null, spawnError?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (termTimer) clearTimeout(termTimer);
      if (forceTimer) clearTimeout(forceTimer);
      signal?.removeEventListener("abort", abort);
      resolveResult({ code, ...(spawnError ? { spawnError } : {}) });
    };
    const stop = (kind: "timeout" | "cancel") => {
      if (settled) return;
      if (kind === "timeout") timedOut = true;
      else cancelled = true;
      killGroup(child, "SIGTERM");
      termTimer = setTimeout(() => {
        if (settled) return;
        killGroup(child, "SIGKILL");
        forceTimer = setTimeout(() => settle(null), 500);
      }, 2_000);
    };
    const abort = () => stop("cancel");
    child.once("error", (error) => {
      append(`${error.message}\n`);
      settle(null, error);
    });
    child.once("close", (code) => settle(code));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    timer = setTimeout(() => stop("timeout"), timeoutMs);
  });
  stream.end();
  await finished(stream);
  return { ...result, timedOut, cancelled };
}

export async function runTestSuite(input: TestSuiteInput, signal?: AbortSignal): Promise<TestSuiteResult> {
  const cwd = await canonicalExistingDirectory(input.cwd, "cwd");
  const label = safeLabel(input.label);
  const logRoot = await resolveTestLogRoot(cwd, input.logRoot);
  const logPath = join(logRoot, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}-${label}.log`);
  const started = performance.now();
  const result = await runCommand(input.command, cwd, logPath, input.timeoutMs, signal);
  const durationMs = Math.round(performance.now() - started);
  const passed = result.code === 0 && !result.timedOut && !result.cancelled && !result.spawnError;
  const status: TestSuiteDetails["status"] = result.timedOut ? "timeout" : result.cancelled ? "cancel" : passed ? "pass" : "fail";
  const logFile = basename(logPath);
  const logLocation = await logicalLogLocation(cwd, logRoot, logFile);
  const statusText = status === "pass"
    ? `PASS ${label} (exit 0, ${durationMs}ms)`
    : status === "timeout"
      ? `TIMEOUT ${label} (${durationMs}ms)`
      : status === "cancel"
        ? `CANCEL ${label} (${durationMs}ms)`
        : `FAIL ${label} (${result.spawnError ? "spawn failed" : `exit ${result.code}`}, ${durationMs}ms)`;
  return {
    text: `${statusText}\nLog: ${logLocation}`,
    details: {
      status,
      passed,
      durationMs,
      logFile,
      logLocation,
      timedOut: result.timedOut,
      cancelled: result.cancelled,
      exitCode: result.code,
    },
  };
}

export function registerTestSuiteTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "pinot_run_test_suite",
    label: "Pinot Run Test Suite",
    description: "Run one exact project test command with a bounded timeout, store complete output in an allowed ignored log root, and return concise status.",
    promptSnippet: "Run the exact focused or final test command and keep full output in the safe ignored log path.",
    promptGuidelines: [
      "Use pinot_run_test_suite for one exact command in the selected project cwd; do not replace the command with a guessed alternative.",
      "Use its concise result and log path rather than dumping the complete test output into the conversation.",
    ],
    parameters: TestSuiteSchema,
    executionMode: "sequential",
    async execute(_id, params, signal) {
      const result = await runTestSuite(params as TestSuiteInput, signal);
      return { content: [{ type: "text" as const, text: result.text }], details: result.details };
    },
  });
}