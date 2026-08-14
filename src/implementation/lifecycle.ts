import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getSupportedThinkingLevels, StringEnum, type ModelThinkingLevel } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { parseModelReference } from "../config/status.ts";
import { isExactBuiltInModel, validateAuthResult } from "../delegation/index.ts";
import { parsePinotConfig, type ImplementerEffort, type PinotConfig } from "../config/types.ts";
import {
  IMPLEMENTER_PROFILES,
  IMPLEMENTER_PROFILE_ENV,
  isImplementerProfile,
  recoverImplementerProfileFromJsonl,
  type ImplementerProfile,
} from "./profile.ts";
import { inspectState, type StateStatus } from "../state/setup.ts";
import { resolveStatePaths, type StatePaths } from "../state/paths.ts";
import { boundedResultText } from "../delegation/limits.ts";
import {
  contextSnapshot,
  estimateChildContextFromJsonl,
  guardCycleTime,
  guardCyclesFromJsonl,
  summarizeGuard,
  type GuardBaseline,
  type GuardSummary,
} from "./guard.ts";

export const IMPLEMENTER_ACTIONS = ["start", "resume", "follow_up", "compact", "wait", "close"] as const;
export type ImplementerAction = (typeof IMPLEMENTER_ACTIONS)[number];
export const IMPLEMENTER_EFFORTS = ["standard", "maximum"] as const;
export { IMPLEMENTER_PROFILES, recoverImplementerProfileFromJsonl } from "./profile.ts";
export const IMPLEMENTER_WAIT_SLICE_MS = 600_000;
export const IMPLEMENTER_CHECKPOINT_GRACE_MS = 60_000;
export const IMPLEMENTER_CHECKPOINT_POLL_MS = 250;
export const MIN_SUPPORTED_HERDR = { major: 0, minor: 7, patch: 5 } as const;

export const ImplementerSchema = Type.Object({
  action: Type.Union(IMPLEMENTER_ACTIONS.map((action) => Type.Literal(action))),
  name: Type.String({ minLength: 1, maxLength: 32, description: "Herdr-safe lowercase implementer identity." }),
  cwd: Type.Optional(Type.String({ description: "Project directory; retain the same value for every lifecycle action." })),
  assignment: Type.Optional(Type.String({ minLength: 1, maxLength: 4_000, description: "Bounded assignment for start, resume, or follow_up." })),
  modelEffort: Type.Optional(StringEnum(IMPLEMENTER_EFFORTS, { description: "Start-only neutral implementer effort class." })),
  profile: Type.Optional(StringEnum(IMPLEMENTER_PROFILES, { description: "Start-only durable child profile; implementation is the default." })),
}, { additionalProperties: false });
export type ImplementerInput = Static<typeof ImplementerSchema>;

export interface SelectedImplementerModel {
  effort?: ImplementerEffort;
  spec: string;
  provider: string;
  model: string;
  thinking: ModelThinkingLevel;
}

export interface DurableSession {
  id: string;
  path: string;
  directory: string;
  legacy: boolean;
  cwd?: string;
}

export interface PublicDurableSession {
  id: string;
  legacy: boolean;
}

export interface ImplementerHost {
  paneId: string;
  name: string;
  target: string;
  status: string;
  source: "session" | "name" | "pane";
}

export interface ImplementerContextMeasurement {
  tokens: number | null;
  contextWindow: number | null;
  percent: number | null;
  status: "known" | "unknown";
  atOrAboveCap: boolean | null;
  reason?: string;
}

export interface CheckpointDelivery {
  text: string;
  fresh: boolean | null;
}

export type ImplementerDelivery =
  | { stillWorking: true; elapsedSeconds: number; paneId: string }
  | { stillWorking: false; checkpoint: CheckpointDelivery; paneId: string };

export interface ImplementerRunOptions {
  modelRegistry: Pick<ModelRegistry, "find"> & Partial<Pick<ModelRegistry, "getProviderAuth" | "getRegisteredProviderConfig" | "getRegisteredNativeProvider">>;
  config?: PinotConfig;
  statePaths?: StatePaths;
  signal?: AbortSignal;
  exec?: ExtensionAPI["exec"];
  now?: () => number;
  pause?: (milliseconds: number) => Promise<void>;
}

export interface ImplementerDetails {
  action: ImplementerAction;
  name: string;
  childSession: PublicDurableSession | null;
  profile: ImplementerProfile;
  host: ImplementerHost | null;
  selectedModel: SelectedImplementerModel | null;
  context: ImplementerContextMeasurement;
  guard: GuardSummary;
  checkpoint: { present: boolean; size: number | null; mtimeMs: number | null; fresh: boolean | null };
}

interface HerdrResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface AgentReference {
  path?: string;
  id?: string;
}

interface ParsedSession {
  id: string;
  cwd?: string;
  provider?: string;
  model?: string;
  thinking?: ModelThinkingLevel;
}

interface HerdrPreflight {
  version: string;
  parentPaneId: string;
}

interface ImplementerAuth {
  apiKey: string;
  headers?: Record<string, string>;
  baseUrl?: string;
  env?: Record<string, string>;
}

interface ImplementerAuthBridge {
  version: 1;
  provider: string;
  model: string;
  root: string;
  auth: {
    apiKey: string;
    headers?: Record<string, string>;
    baseUrl?: string;
  };
  env?: Record<string, string>;
}

const SUPPORT_CONTEXT_GUARD = fileURLToPath(new URL("./support/implementer-context-guard.ts", import.meta.url));
const SUPPORT_HERDR_STATE = fileURLToPath(new URL("./support/herdr-agent-state.ts", import.meta.url));
const SUPPORT_IMPLEMENTER_AUTH = fileURLToPath(new URL("./support/implementer-auth.ts", import.meta.url));
const SUPPORT_SYSTEM_PROMPT = fileURLToPath(new URL("./support/implementer-system.txt", import.meta.url));
const SUPPORT_JANITOR_SKILL = fileURLToPath(new URL("../../skills/pinot-janitor/SKILL.md", import.meta.url));
const IMPLEMENTER_AUTH_BRIDGE = "PINOT_IMPLEMENTER_AUTH_BRIDGE";
const IMPLEMENTER_PROVIDER = "PINOT_IMPLEMENTER_PROVIDER";
const IMPLEMENTER_MODEL = "PINOT_IMPLEMENTER_MODEL";
const MAX_CHECKPOINT_RESULT_BYTES = 50_000;
const IMPLEMENTER_CHILD_MARKER = "PINOT_IMPLEMENTER_CHILD";
const IMPLEMENTER_LIFECYCLE_OWNER_MARKER = "PINOT_HERDR_LIFECYCLE_OWNER_PID";
const IMPLEMENTER_COMPACT_COMMAND = "pinot-implementer-compact";
const VALID_NAME = /^[a-z][a-z0-9_-]{0,31}$/;
const VALID_SESSION_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;
const VALID_THINKING: readonly ModelThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

export function agentSessionReference(agent: unknown): AgentReference {
  if (!agent || typeof agent !== "object" || Array.isArray(agent)) return {};
  const record = agent as Record<string, unknown>;
  const value = record.agent_session;
  const reference = typeof value === "string" ? value : value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>).value : undefined;
  if (typeof reference === "string" && reference) return reference.startsWith("/") ? { path: reference } : { id: reference };
  if (typeof record.agent_session_path === "string" && record.agent_session_path) return { path: record.agent_session_path };
  if (typeof record.agent_session_id === "string" && record.agent_session_id) return { id: record.agent_session_id };
  return {};
}

function jsonlEntries(jsonl: string): unknown[] {
  const entries: unknown[] = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    try { entries.push(JSON.parse(line)); } catch { /* A final partial line is possible during a write. */ }
  }
  return entries;
}

export function recoverSelectedModelFromJsonl(jsonl: string): Omit<SelectedImplementerModel, "effort"> | undefined {
  let provider: string | undefined;
  let model: string | undefined;
  let thinking: ModelThinkingLevel | undefined;
  for (const entry of jsonlEntries(jsonl)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (record.type === "session") {
      if (typeof record.provider === "string") provider = record.provider;
      if (typeof record.modelId === "string") model = record.modelId;
      if (typeof record.thinkingLevel === "string" && VALID_THINKING.includes(record.thinkingLevel as ModelThinkingLevel)) thinking = record.thinkingLevel as ModelThinkingLevel;
    } else if (record.type === "model_change") {
      if (typeof record.provider === "string") provider = record.provider;
      if (typeof record.modelId === "string") model = record.modelId;
    } else if (record.type === "thinking_level_change") {
      if (typeof record.thinkingLevel === "string" && VALID_THINKING.includes(record.thinkingLevel as ModelThinkingLevel)) thinking = record.thinkingLevel as ModelThinkingLevel;
    } else if (record.type === "message" && record.message && typeof record.message === "object" && !Array.isArray(record.message)) {
      const message = record.message as Record<string, unknown>;
      if (message.role === "assistant") {
        if (typeof message.provider === "string") provider = message.provider;
        if (typeof message.model === "string") model = message.model;
      }
    }
  }
  if (!provider || !model || !thinking) return undefined;
  return { spec: `${provider}/${model}:${thinking}`, provider, model, thinking };
}

function parsedSessionHeader(jsonl: string, path: string): ParsedSession {
  const first = jsonlEntries(jsonl)[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) throw new Error(`Implementer session is invalid: ${basename(path)}.`);
  const record = first as Record<string, unknown>;
  if (record.type !== "session" || typeof record.id !== "string" || !record.id || !VALID_SESSION_ID.test(record.id)) throw new Error(`Implementer session has no valid Pi identity: ${basename(path)}.`);
  return {
    id: record.id,
    ...(typeof record.cwd === "string" ? { cwd: record.cwd } : {}),
    ...(typeof record.provider === "string" ? { provider: record.provider } : {}),
    ...(typeof record.modelId === "string" ? { model: record.modelId } : {}),
    ...(typeof record.thinkingLevel === "string" && VALID_THINKING.includes(record.thinkingLevel as ModelThinkingLevel) ? { thinking: record.thinkingLevel as ModelThinkingLevel } : {}),
  };
}

async function sessionFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl")).map((entry) => join(directory, entry.name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new Error(`Cannot inspect implementer session directory: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function resolveDurableSession(directory: string, expectedId: string): Promise<DurableSession | undefined> {
  const paths = await sessionFiles(directory);
  if (paths.length === 0) return undefined;
  const files = await Promise.all(paths.map(async (path) => {
    const canonical = await realpath(path);
    const header = parsedSessionHeader(await readFile(canonical, "utf8"), canonical);
    return { path: canonical, ...header };
  }));
  const exact = files.filter((file) => file.id === expectedId);
  if (exact.length > 1) throw new Error(`Implementer ${expectedId} has duplicate session identities; refusing to guess.`);
  if (exact.length === 1) return { id: exact[0].id, path: exact[0].path, directory, legacy: false, ...(exact[0].cwd ? { cwd: exact[0].cwd } : {}) };
  if (files.length === 1) return { id: files[0].id, path: files[0].path, directory, legacy: true, ...(files[0].cwd ? { cwd: files[0].cwd } : {}) };
  throw new Error(`Implementer ${expectedId} has multiple unmatched session files; refusing to guess.`);
}

function selectedModelForEffort(config: PinotConfig, effort: ImplementerEffort, registry: Pick<ModelRegistry, "find">): SelectedImplementerModel {
  const spec = config.implementerEffort[effort];
  if (!spec) throw new Error(`No model is configured for the ${effort} implementer effort. Run /pinot-setup, then configure implementerEffort.${effort}.`);
  const parsed = parseModelReference(spec);
  if (!parsed) throw new Error(`The ${effort} implementer model mapping is invalid.`);
  const model = registry.find(parsed.provider, parsed.model);
  if (!model) throw new Error(`Configured implementer model ${parsed.provider}/${parsed.model} is unavailable in Pi.`);
  if (!getSupportedThinkingLevels(model).includes(parsed.thinking as ModelThinkingLevel)) {
    throw new Error(`Configured implementer model ${parsed.provider}/${parsed.model} does not support thinking level ${parsed.thinking}.`);
  }
  return { effort, spec, provider: parsed.provider, model: parsed.model, thinking: parsed.thinking as ModelThinkingLevel };
}

function validateLaunchModel(selected: SelectedImplementerModel, registry: ImplementerRunOptions["modelRegistry"]): void {
  const model = registry.find(selected.provider, selected.model);
  if (!model || !isExactBuiltInModel(selected.provider, selected.model, model)) {
    throw new Error(`Configured implementer model ${selected.provider}/${selected.model} must be an exact built-in Pi model for isolated Herdr implementation.`);
  }
  if (!registry.getRegisteredProviderConfig || !registry.getRegisteredNativeProvider) {
    throw new Error("Pi's provider registry does not expose the custom-provider checks required for isolated Herdr implementation.");
  }
  if (registry.getRegisteredProviderConfig(selected.provider) !== undefined || registry.getRegisteredNativeProvider(selected.provider) !== undefined) {
    throw new Error(`Provider "${selected.provider}" uses custom provider behavior and is unsupported for isolated Herdr implementation.`);
  }
}

async function resolveLaunchAuth(selected: SelectedImplementerModel, registry: ImplementerRunOptions["modelRegistry"]): Promise<ImplementerAuth> {
  validateLaunchModel(selected, registry);
  if (!registry.getProviderAuth) throw new Error("Pi's provider authentication API is unavailable; refusing to create an implementer pane.");
  let raw: unknown;
  try { raw = await registry.getProviderAuth(selected.provider); }
  catch { throw new Error(`Authentication for provider "${selected.provider}" is unavailable; refusing to create an implementer pane.`); }
  try { return validateAuthResult(selected.provider, raw); }
  catch { throw new Error(`Authentication for provider "${selected.provider}" is unavailable or unsupported; refusing to create an implementer pane.`); }
}

async function writeAuthBridge(sessionDirectory: string, cwd: string, selected: SelectedImplementerModel, auth: ImplementerAuth): Promise<string> {
  const path = join(sessionDirectory, `.pinot-auth-${randomUUID()}.json`);
  const bridge: ImplementerAuthBridge = {
    version: 1,
    provider: selected.provider,
    model: selected.model,
    root: cwd,
    auth: { apiKey: auth.apiKey, ...(auth.headers ? { headers: auth.headers } : {}), ...(auth.baseUrl ? { baseUrl: auth.baseUrl } : {}) },
    ...(auth.env ? { env: auth.env } : {}),
  };
  await writeFile(path, `${JSON.stringify(bridge)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await chmod(path, 0o600);
  const info = await lstat(path);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (info.isSymbolicLink() || !info.isFile() || (currentUid !== undefined && info.uid !== undefined && Number(info.uid) !== currentUid) || (Number(info.mode) & 0o7777) !== 0o600) {
    await rm(path, { force: true });
    throw new Error("Refusing an unsafe implementer authentication handoff.");
  }
  return path;
}

async function recoverModel(session: DurableSession, registry: Pick<ModelRegistry, "find">): Promise<SelectedImplementerModel> {
  const recovered = recoverSelectedModelFromJsonl(await readFile(session.path, "utf8"));
  if (!recovered) throw new Error(`Implementer session ${session.id} has no recoverable immutable model/thinking metadata; refusing to resume.`);
  const model = registry.find(recovered.provider, recovered.model);
  if (!model || !getSupportedThinkingLevels(model).includes(recovered.thinking)) {
    throw new Error(`Implementer session ${session.id} immutable model ${recovered.spec} is unavailable for resume.`);
  }
  return { ...recovered, effort: undefined };
}

async function recoverProfile(session: DurableSession): Promise<ImplementerProfile> {
  const profile = recoverImplementerProfileFromJsonl(await readFile(session.path, "utf8"));
  if (!profile) throw new Error(`Implementer session ${session.id} has no immutable profile metadata; refusing recovery.`);
  return profile;
}

function parseVersion(value: string): { major: number; minor: number; patch: number } | undefined {
  const match = /(?:^|\s)v?(\d+)\.(\d+)\.(\d+)(?:\s|$)/.exec(value);
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : undefined;
}

function versionAtLeast(version: { major: number; minor: number; patch: number }, minimum: typeof MIN_SUPPORTED_HERDR): boolean {
  return version.major > minimum.major || (version.major === minimum.major && (version.minor > minimum.minor || (version.minor === minimum.minor && version.patch >= minimum.patch)));
}

function integrationIsCurrent(stdout: string): boolean {
  const line = stdout.split(/\r?\n/).find((candidate) => /^\s*pi\s*:/i.test(candidate));
  if (!line) return false;
  const state = line.slice(line.indexOf(":") + 1).split("(", 1)[0].trim().toLowerCase();
  return /^current(?:\s|$)/.test(state);
}

async function runHerdr(exec: ExtensionAPI["exec"], args: string[], timeout: number): Promise<HerdrResult> {
  try {
    return await exec("herdr", args, { timeout });
  } catch (error) {
    throw new Error(`Herdr prerequisite command failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function preflightHerdr(exec: ExtensionAPI["exec"], cwd: string): Promise<HerdrPreflight> {
  if (process.env.HERDR_ENV !== "1") throw new Error("Durable implementation requires an active Herdr environment (HERDR_ENV=1); do not substitute main-agent editing.");
  const socketPath = process.env.HERDR_SOCKET_PATH;
  const expectedPaneId = process.env.HERDR_PANE_ID;
  if (!socketPath || !expectedPaneId) throw new Error("Durable implementation requires an active Herdr socket and pane; start Pinot from a Herdr-managed pane.");
  const versionResult = await runHerdr(exec, ["--version"], 5_000);
  if (versionResult.code !== 0) throw new Error("Herdr is unavailable; install or start the supported Herdr version before implementation.");
  const parsed = parseVersion(versionResult.stdout);
  if (!parsed || !versionAtLeast(parsed, MIN_SUPPORTED_HERDR)) throw new Error(`Herdr ${MIN_SUPPORTED_HERDR.major}.${MIN_SUPPORTED_HERDR.minor}.${MIN_SUPPORTED_HERDR.patch} or newer is required for durable implementation.`);
  const server = await runHerdr(exec, ["status", "server"], 5_000);
  if (server.code !== 0) throw new Error("The Herdr server/socket is not active; start Herdr before durable implementation.");
  const integration = await runHerdr(exec, ["integration", "status"], 5_000);
  if (integration.code !== 0 || !integrationIsCurrent(integration.stdout)) throw new Error("The current Herdr Pi integration is unavailable or not current; install/update the Pi integration before durable implementation.");
  const current = await runHerdr(exec, ["pane", "current", "--current"], 5_000);
  if (current.code !== 0) throw new Error("Herdr could not verify the current parent pane; refusing to create an implementer pane.");
  let pane: Record<string, unknown> | undefined;
  try {
    const value = JSON.parse(current.stdout);
    const candidate = value?.result?.pane ?? value?.pane;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) pane = candidate as Record<string, unknown>;
  } catch {
    pane = undefined;
  }
  if (!pane || pane.pane_id !== expectedPaneId || pane.agent !== "pi") throw new Error("The current Herdr pane is not the active Pi parent; refusing to create an implementer pane.");
  const parentCwd = typeof pane.cwd === "string" ? pane.cwd : undefined;
  const foregroundCwd = typeof pane.foreground_cwd === "string" ? pane.foreground_cwd : undefined;
  if (!parentCwd || await canonicalDirectory(parentCwd, "Herdr parent cwd") !== cwd || (foregroundCwd && await canonicalDirectory(foregroundCwd, "Herdr foreground cwd") !== cwd)) {
    throw new Error("The active Herdr parent pane is not attached to the requested project; refusing to create an implementer pane.");
  }
  return { version: versionResult.stdout.trim().split(/\s+/).at(-1) ?? "unknown", parentPaneId: expectedPaneId };
}

async function canonicalDirectory(path: string, label: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error(`${label} must be an absolute directory.`);
  const canonical = await realpath(resolve(path));
  if (!(await stat(canonical)).isDirectory()) throw new Error(`${label} is not a directory.`);
  return canonical;
}

async function validateState(paths: StatePaths): Promise<StateStatus> {
  const status = await inspectState(paths);
  if (status.config !== "valid") throw new Error(`Pinot state is not initialized at ${paths.root}; run /pinot-setup and configure an implementer model.`);
  const required = status.entries.filter((entry) => entry.path === paths.implementationSessions || entry.path === paths.implementationCheckpoints);
  if (required.some((entry) => entry.kind !== "directory")) throw new Error(`Pinot implementer state is unavailable at ${paths.root}; run /pinot-setup again.`);
  return status;
}

function childDirectoryPaths(paths: StatePaths, name: string): { sessionDirectory: string; checkpointPath: string } {
  assertSessionIdSafe(name);
  return { sessionDirectory: join(paths.implementationSessions, name), checkpointPath: join(paths.implementationCheckpoints, `${name}.md`) };
}

async function validateImplementerRoots(paths: StatePaths): Promise<void> {
  const rootInfo = await lstat(paths.implementationRoot);
  const sessionsInfo = await lstat(paths.implementationSessions);
  const checkpointsInfo = await lstat(paths.implementationCheckpoints);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : undefined;
  for (const [label, info] of [["implementer", rootInfo], ["implementer sessions", sessionsInfo], ["implementer checkpoints", checkpointsInfo]] as const) {
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Refusing unsafe ${label} state root.`);
    if (currentUid !== undefined && info.uid !== undefined && Number(info.uid) !== currentUid) throw new Error(`Refusing ${label} state root not owned by the current user.`);
    if ((Number(info.mode) & 0o7777) !== 0o700) throw new Error(`Refusing unsafe permissions on ${label} state root.`);
  }
}

async function ensureChildDirectories(paths: StatePaths, name: string): Promise<{ sessionDirectory: string; checkpointPath: string }> {
  const directories = childDirectoryPaths(paths, name);
  await validateImplementerRoots(paths);
  const currentUid = typeof process.getuid === "function" ? process.getuid() : undefined;
  await mkdir(directories.sessionDirectory, { recursive: true, mode: 0o700 });
  const sessionInfo = await lstat(directories.sessionDirectory);
  if (sessionInfo.isSymbolicLink() || !sessionInfo.isDirectory() || (currentUid !== undefined && sessionInfo.uid !== undefined && Number(sessionInfo.uid) !== currentUid) || (Number(sessionInfo.mode) & 0o7777) !== 0o700) throw new Error(`Refusing unsafe implementer session directory for ${name}.`);
  await chmod(directories.sessionDirectory, 0o700);
  return directories;
}

async function inspectChildDirectories(paths: StatePaths, name: string): Promise<{ sessionDirectory: string; checkpointPath: string }> {
  const directories = childDirectoryPaths(paths, name);
  await validateImplementerRoots(paths);
  try {
    const info = await lstat(directories.sessionDirectory);
    const currentUid = typeof process.getuid === "function" ? process.getuid() : undefined;
    if (info.isSymbolicLink() || !info.isDirectory() || (currentUid !== undefined && info.uid !== undefined && Number(info.uid) !== currentUid) || (Number(info.mode) & 0o7777) !== 0o700) throw new Error(`Refusing unsafe implementer session directory for ${name}.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return directories;
}

async function readGuard(path: string | undefined): Promise<{ cycles: ReturnType<typeof guardCyclesFromJsonl>; summary: GuardSummary }> {
  if (!path) return { cycles: [], summary: summarizeGuard([], "child session path unavailable") };
  try {
    const jsonl = await readFile(path, "utf8");
    for (const line of jsonl.split("\n")) {
      if (!line.trim()) continue;
      try { JSON.parse(line); } catch { throw new Error("guard markers are unreadable"); }
    }
    const cycles = guardCyclesFromJsonl(jsonl);
    return { cycles, summary: summarizeGuard(cycles) };
  } catch {
    return { cycles: [], summary: summarizeGuard([], "guard markers unavailable") };
  }
}

function publicGuardSummary(summary: GuardSummary): GuardSummary {
  if (!summary.latest?.error) return summary;
  return { ...summary, latest: { ...summary.latest, error: "guard cycle failed" } };
}

async function checkpointDetails(path: string, fresh: boolean | null): Promise<ImplementerDetails["checkpoint"]> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink() || !info.isFile()) return { present: false, size: null, mtimeMs: null, fresh };
    return { present: true, size: info.size, mtimeMs: info.mtimeMs, fresh };
  } catch {
    return { present: false, size: null, mtimeMs: null, fresh };
  }
}

async function requireSettledCloseState(name: string, checkpointPath: string, childPath: string): Promise<void> {
  const checkpoint = await checkpointDetails(checkpointPath, null);
  if (!checkpoint.present) throw new Error(`Implementer ${name} requires a regular checkpoint before close; refusing to close.`);
  const guard = await readGuard(childPath);
  if (guard.summary.reason) throw new Error(`Implementer ${name} guard state is unavailable; refusing to close.`);
  if (guard.summary.pending) throw new Error(`Implementer ${name} has a pending guard cycle; refusing to close.`);
  if (guard.summary.outcome === "failed") throw new Error(`Implementer ${name} has a failed guard cycle; refusing to close.`);
}

async function waitForCheckpoint(path: string, name: string, action: string, minimumMtime: number | undefined, pause: (milliseconds: number) => Promise<void>, now: () => number): Promise<CheckpointDelivery> {
  const deadline = now() + IMPLEMENTER_CHECKPOINT_GRACE_MS;
  let lastError = "checkpoint is missing";
  while (now() < deadline) {
    try {
      const pathInfo = await lstat(path);
      if (pathInfo.isSymbolicLink() || !pathInfo.isFile()) throw new Error("checkpoint is not a regular file");
      if (minimumMtime !== undefined && pathInfo.mtimeMs <= minimumMtime) throw new Error("checkpoint is not newer than this action");
      return { text: boundedCheckpointText(await readFile(path, "utf8")), fresh: minimumMtime === undefined ? null : true };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (now() < deadline) await pause(IMPLEMENTER_CHECKPOINT_POLL_MS);
    }
  }
  throw new Error(`Implementer ${name} did not deliver a ${minimumMtime === undefined ? "required" : "fresh"} checkpoint for ${action}: ${lastError}. Do not fall back to main-agent editing.`);
}

function boundedCheckpointText(text: string): string {
  if (Buffer.byteLength(text, "utf8") <= MAX_CHECKPOINT_RESULT_BYTES) return text;
  const suffix = "\n[Checkpoint output truncated.]";
  const bytes = Buffer.from(text, "utf8");
  const room = Math.max(0, MAX_CHECKPOINT_RESULT_BYTES - Buffer.byteLength(suffix, "utf8"));
  let prefix = bytes.subarray(0, room).toString("utf8");
  while (Buffer.byteLength(prefix, "utf8") > room) prefix = prefix.slice(0, -1);
  return `${prefix}${suffix}`;
}

function isCheckpointError(error: unknown): boolean {
  return /checkpoint .*did not deliver|checkpoint is (?:older|not newer)/.test(error instanceof Error ? error.message : String(error));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function herdrResultTimedOut(result: HerdrResult): boolean {
  return [result.stdout, result.stderr].some((text) => {
    if (/\btimeout\b|timed out/i.test(text)) return true;
    try {
      const value = JSON.parse(text);
      return value?.error?.code === "timeout" || value?.result?.error?.code === "timeout";
    } catch {
      return false;
    }
  });
}

async function waitForHerdrAgent(exec: ExtensionAPI["exec"], name: string): Promise<boolean> {
  const result = await runHerdr(exec, ["agent", "wait", name, "--until", "idle", "--until", "done", "--until", "blocked", "--timeout", String(IMPLEMENTER_WAIT_SLICE_MS)], IMPLEMENTER_WAIT_SLICE_MS + 30_000);
  if (result.code === 0) return false;
  if (herdrResultTimedOut(result)) return true;
  if (/agent_not_found|agent target .* not found/i.test(`${result.stdout}\n${result.stderr}`)) return true;
  throw new Error("Herdr could not wait for the implementer host.");
}

function agentName(agent: unknown): string | undefined {
  if (!agent || typeof agent !== "object" || Array.isArray(agent)) return undefined;
  const value = (agent as Record<string, unknown>).name;
  return typeof value === "string" && value ? value : undefined;
}

function agentCwd(agent: unknown): string | undefined {
  if (!agent || typeof agent !== "object" || Array.isArray(agent)) return undefined;
  const value = (agent as Record<string, unknown>).cwd;
  return typeof value === "string" && value ? value : undefined;
}

async function hostMatchesCwd(agent: unknown, cwd: string): Promise<boolean> {
  const value = agentCwd(agent);
  if (!value) return false;
  try { return await canonicalDirectory(value, "Herdr implementer cwd") === cwd; }
  catch { return false; }
}

function hostFrom(agent: unknown, source: ImplementerHost["source"], fallbackName: string): ImplementerHost | undefined {
  if (!agent || typeof agent !== "object" || Array.isArray(agent)) return undefined;
  const record = agent as Record<string, unknown>;
  if (typeof record.pane_id !== "string" || !record.pane_id) return undefined;
  const name = agentName(agent) ?? fallbackName;
  return { paneId: record.pane_id, name, target: name, status: typeof record.agent_status === "string" ? record.agent_status : "unknown", source };
}

async function hostMatchesSession(agent: unknown, expected: DurableSession): Promise<boolean> {
  const reference = agentSessionReference(agent);
  if (reference.path) {
    try {
      const info = await lstat(reference.path);
      if (info.isSymbolicLink() || !info.isFile()) return false;
      return await realpath(reference.path) === expected.path;
    } catch {
      return false;
    }
  }
  if (reference.id) return reference.id === expected.id;
  return false;
}

function assertSessionIdSafe(id: string): void {
  if (!VALID_SESSION_ID.test(id)) throw new Error(`Implementer session identity ${id} is not accepted by Pi.`);
}

async function baselineFor(session: DurableSession | undefined, actionStartedAt: number): Promise<GuardBaseline> {
  const snapshot = await readGuard(session?.path);
  return {
    actionStartedAt,
    cycleIds: new Set(snapshot.cycles.map((cycle) => cycle.cycleId)),
    pendingCycleIds: new Set(snapshot.cycles.filter((cycle) => cycle.state === "started").map((cycle) => cycle.cycleId)),
  };
}

async function waitForGuard(path: string, baseline: GuardBaseline, pause: (milliseconds: number) => Promise<void>, now: () => number, requireNew = false): Promise<GuardSummary> {
  const deadline = now() + IMPLEMENTER_WAIT_SLICE_MS;
  let reason = "";
  while (now() < deadline) {
    const snapshot = await readGuard(path);
    if (snapshot.summary.reason) {
      reason = snapshot.summary.reason;
      await pause(IMPLEMENTER_CHECKPOINT_POLL_MS);
      continue;
    }
    const fresh = snapshot.cycles.filter((cycle) => !baseline.cycleIds.has(cycle.cycleId) && guardCycleTime(cycle) >= baseline.actionStartedAt);
    const relevant = new Set([...baseline.pendingCycleIds, ...fresh.map((cycle) => cycle.cycleId)]);
    const failed = snapshot.cycles.find((cycle) => cycle.state === "failed" && relevant.has(cycle.cycleId));
    if (failed) throw new Error(`Implementer guard cycle ${failed.cycleId} failed.`);
    const settled = !snapshot.summary.pending && fresh.every((cycle) => cycle.state !== "started");
    if (settled && (!requireNew || fresh.some((cycle) => cycle.state === "completed" || cycle.state === "failed"))) return snapshot.summary;
    await pause(IMPLEMENTER_CHECKPOINT_POLL_MS);
  }
  throw new Error(`Implementer guard markers did not settle within the bounded wait${reason ? `: ${reason}` : "."}`);
}

async function contextFor(session: DurableSession | undefined, selected: SelectedImplementerModel | null, registry: Pick<ModelRegistry, "find">): Promise<ImplementerContextMeasurement> {
  const contextWindow = selected ? registry.find(selected.provider, selected.model)?.contextWindow ?? null : null;
  if (!session) return { tokens: null, contextWindow, percent: null, status: "unknown", atOrAboveCap: null, reason: "child session path unavailable" };
  try {
    const estimate = estimateChildContextFromJsonl(await readFile(session.path, "utf8"));
    const percent = estimate.tokens !== null && contextWindow ? (estimate.tokens / contextWindow) * 100 : null;
    return { tokens: estimate.tokens, contextWindow, percent, status: percent === null ? "unknown" : "known", atOrAboveCap: percent === null ? null : percent >= 80, ...(percent === null ? { reason: estimate.reason ?? "context window unavailable" } : {}) };
  } catch (error) {
    return { tokens: null, contextWindow, percent: null, status: "unknown", atOrAboveCap: null, reason: "child context usage unavailable" };
  }
}

async function waitForHostDisappearance(exec: ExtensionAPI["exec"], paneId: string, pause: (milliseconds: number) => Promise<void>, now: () => number): Promise<void> {
  const deadline = now() + IMPLEMENTER_CHECKPOINT_GRACE_MS;
  while (now() < deadline) {
    const result = await runHerdr(exec, ["agent", "get", paneId], 30_000);
    if (result.code !== 0) {
      if (/agent_not_found|agent target .* not found|pane .* not found/i.test(`${result.stdout}\n${result.stderr}`)) return;
      throw new Error("Herdr could not verify implementer host disappearance.");
    }
    if (now() < deadline) await pause(IMPLEMENTER_CHECKPOINT_POLL_MS);
  }
  throw new Error("Herdr did not verify implementer host disappearance within the bounded wait.");
}

async function closeCreatedPane(exec: ExtensionAPI["exec"], paneId: string, pause: (milliseconds: number) => Promise<void>, now: () => number): Promise<void> {
  let closed: HerdrResult;
  try { closed = await runHerdr(exec, ["pane", "close", paneId], 30_000); }
  catch { throw new Error("Implementer pane cleanup close failed."); }
  if (closed.code !== 0) throw new Error("Implementer pane cleanup close failed.");
  try { await waitForHostDisappearance(exec, paneId, pause, now); }
  catch { throw new Error("Implementer pane cleanup disappearance verification failed."); }
}

async function closeStoppedPane(
  exec: ExtensionAPI["exec"],
  paneId: string,
  expected: DurableSession | undefined,
  getAgent: (target: string) => Promise<unknown>,
  name: string,
  cwd: string,
  pause: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise<void>((resolvePause) => setTimeout(resolvePause, milliseconds)),
  now: () => number = Date.now,
): Promise<boolean> {
  try {
    const agent = await getAgent(paneId);
    const host = hostFrom(agent, "pane", name);
    if (!host || host.paneId !== paneId || agentName(agent) !== name || !await hostMatchesCwd(agent, cwd) || (expected && !await hostMatchesSession(agent, expected))) return false;
    if (host.status !== "idle" && host.status !== "done") return false;
    const result = await runHerdr(exec, ["pane", "close", paneId], 30_000);
    if (result.code !== 0) return false;
    await waitForHostDisappearance(exec, paneId, pause, now);
    return true;
  } catch {
    return false;
  }
}

function assignmentPrompt(assignment: string, checkpointPath: string, cwd: string): string {
  return `${assignment}\n\nThis is one bounded implementation assignment. Work only in ${cwd}. Do not commit or delegate. Run focused verification as appropriate. Before stopping, rewrite one complete fresh checkpoint-v4 to ${checkpointPath} with changed files, verification results, deviations, open questions, and worktree state. A checkpoint is required even if blocked or incomplete.`;
}

function semanticCheckpointText(text: string): string {
  const redacted = text
    .replace(/\bauthorization\s*:\s*bearer\s+[^\s,;]+/gi, "[redacted-credential]")
    .replace(/\bbearer\s+[^\s,;]+/gi, "[redacted-credential]")
    .replace(/\b(?:api(?:[_-]|\s)?key|access(?:[_-]|\s)?token|refresh(?:[_-]|\s)?token|client(?:[_-]|\s)?secret|authorization|key|token|secret)\s*(?:[:=]|\s)\s*(?:bearer\s+)?[^\s,;]+/gi, "[redacted-credential]")
    .replace(/(?<![A-Za-z0-9_])(?:[A-Za-z]:[\\/]|\/)(?:[^\s\\/]+[\\/])+[^\s,;)'\"]+/g, "[redacted-path]");
  return boundedCheckpointText(redacted);
}

function resultText(action: ImplementerAction, name: string, delivery: ImplementerDelivery | undefined, host: ImplementerHost | null, checkpoint: ImplementerDetails["checkpoint"]): string {
  const headline = delivery?.stillWorking
    ? `Implementer ${name} is still working after ${delivery.elapsedSeconds}s. Call wait again and never close this agent.`
    : delivery
      ? `Implementer ${name} delivered a checkpoint.`
      : `Implementer ${name} ${action} completed.`;
  const lines = [
    headline,
    `Host: ${host ? `${host.name} (${host.paneId}, ${host.status})` : "absent"}.`,
    `Checkpoint: ${checkpoint.present ? "present" : "missing"}${checkpoint.fresh === null ? " (freshness unknown)" : checkpoint.fresh ? " (fresh)" : " (stale)"}.`,
  ];
  if (delivery && !delivery.stillWorking && ["start", "resume", "follow_up", "wait"].includes(action)) {
    lines.push(`Checkpoint-v4:\n${semanticCheckpointText(delivery.checkpoint.text)}`);
  }
  return boundedResultText(lines.join("\n"));
}

export async function runImplementer(input: ImplementerInput, cwdInput: string, options: ImplementerRunOptions): Promise<{ content: string; details: ImplementerDetails }> {
  if (!VALID_NAME.test(input.name)) throw new Error("name must be a Herdr-safe lowercase ID.");
  assertSessionIdSafe(input.name);
  if (input.modelEffort !== undefined && input.action !== "start") throw new Error("modelEffort is supported only for start.");
  if (input.profile !== undefined && input.action !== "start") throw new Error("profile is supported only for start.");
  if (input.profile !== undefined && !isImplementerProfile(input.profile)) throw new Error("profile must be a supported durable child profile.");
  if (["start", "resume", "follow_up"].includes(input.action) && !input.assignment?.trim()) throw new Error(`${input.action} requires a bounded assignment.`);
  const now = options.now ?? Date.now;
  const pause = options.pause ?? ((milliseconds: number) => new Promise<void>((resolvePause) => setTimeout(resolvePause, milliseconds)));
  const exec = options.exec;
  if (!exec) throw new Error("Herdr execution is unavailable in this context.");
  const cwd = await canonicalDirectory(resolve(cwdInput), "Project cwd");
  const paths = options.statePaths ?? resolveStatePaths();
  await validateState(paths);
  const { sessionDirectory, checkpointPath } = input.action === "start"
    ? await ensureChildDirectories(paths, input.name)
    : await inspectChildDirectories(paths, input.name);
  const session = () => resolveDurableSession(sessionDirectory, input.name);
  const getAgent = async (target: string): Promise<unknown> => {
    const result = await runHerdr(exec, ["agent", "get", target], 30_000);
    if (result.code !== 0) throw new Error("Herdr no longer has the requested implementer host.");
    try {
      const value = JSON.parse(result.stdout);
      return value?.result?.agent ?? value?.agent;
    } catch {
      throw new Error("Herdr returned an invalid implementer host record.");
    }
  };
  const listAgents = async (): Promise<unknown[]> => {
    const result = await runHerdr(exec, ["agent", "list"], 30_000);
    if (result.code !== 0) throw new Error("Herdr could not list implementer hosts.");
    try {
      const value = JSON.parse(result.stdout);
      const agents = value?.result?.agents ?? value?.agents;
      if (!Array.isArray(agents)) throw new Error("missing agents");
      return agents;
    } catch {
      throw new Error("Herdr returned an invalid implementer host list.");
    }
  };
  const resolveHost = async (expected?: DurableSession): Promise<ImplementerHost | undefined> => {
    const agents = await listAgents();
    const named = agents.filter((agent) => agentName(agent) === input.name);
    const matching: unknown[] = [];
    for (const agent of named) {
      if (await hostMatchesCwd(agent, cwd) && (!expected || await hostMatchesSession(agent, expected))) matching.push(agent);
    }
    if (named.length > matching.length) {
      throw new Error(`Implementer ${input.name} has a live host with an unverifiable name, session, or project attachment; refusing to choose a writer.`);
    }
    if (matching.length > 1) throw new Error(`Implementer ${input.name} has multiple live hosts; refusing to choose a writer.`);
    if (matching.length === 1) {
      const source: ImplementerHost["source"] = expected ? "session" : "name";
      return hostFrom(matching[0], source, input.name);
    }
    if (expected) {
      const sessionMatches: unknown[] = [];
      for (const agent of agents) if (await hostMatchesSession(agent, expected)) sessionMatches.push(agent);
      if (sessionMatches.length > 1) throw new Error(`Implementer ${input.name} has multiple hosts for durable session ${expected.id}; refusing to choose a writer.`);
      if (sessionMatches.length === 1 && agentName(sessionMatches[0]) !== input.name) throw new Error(`Implementer ${input.name} durable session is attached to a differently named host; refusing to choose a writer.`);
    }
    return undefined;
  };
  const verifyHost = async (host: ImplementerHost, expected?: DurableSession): Promise<ImplementerHost | undefined> => {
    try {
      const agent = await getAgent(host.paneId);
      if ((agent as any)?.pane_id !== host.paneId || agentName(agent) !== input.name || !await hostMatchesCwd(agent, cwd) || !expected || !await hostMatchesSession(agent, expected)) return undefined;
      return hostFrom(agent, host.source, input.name);
    } catch {
      return undefined;
    }
  };
  const modelForSession = async (child: DurableSession): Promise<SelectedImplementerModel> => recoverModel(child, options.modelRegistry);
  const detailsFor = async (action: ImplementerAction, child: DurableSession | undefined, profile: ImplementerProfile, host: ImplementerHost | null, selected: SelectedImplementerModel | null, fresh: boolean | null): Promise<ImplementerDetails> => ({
    action,
    name: input.name,
    childSession: child ? { id: child.id, legacy: child.legacy } : null,
    profile,
    host,
    selectedModel: selected,
    context: await contextFor(child, selected, options.modelRegistry),
    guard: publicGuardSummary((await readGuard(child?.path)).summary),
    checkpoint: await checkpointDetails(checkpointPath, fresh),
  });
  const complete = async (action: ImplementerAction, child: DurableSession, profile: ImplementerProfile, host: ImplementerHost | null, selected: SelectedImplementerModel | null, delivery: ImplementerDelivery | undefined, fresh: boolean | null) => {
    const details = await detailsFor(action, child, profile, host, selected, fresh);
    return { content: resultText(action, input.name, delivery, host, details.checkpoint), details };
  };

  if (input.action === "start") {
    const existing = await session();
    if (existing) throw new Error(`Implementer ${input.name} already has a durable session; resume it or choose a new name. Start never deletes sessions.`);
    const profile: ImplementerProfile = input.profile ?? "implementation";
    const config = options.config ?? await loadPinotConfig(paths);
    const selected = selectedModelForEffort(config, input.modelEffort ?? "standard", options.modelRegistry);
    await preflightHerdr(exec, cwd);
    const live = await resolveHost();
    if (live) throw new Error(`Implementer ${input.name} already has a live host in pane ${live.paneId}; use resume, follow_up, wait, or close instead of starting a duplicate writer.`);
    const auth = await resolveLaunchAuth(selected, options.modelRegistry);
    const bridgePath = await writeAuthBridge(sessionDirectory, cwd, selected, auth);
    let paneId: string | undefined;
    let child: DurableSession | undefined;
    try {
      const baseline: GuardBaseline = { actionStartedAt: now(), cycleIds: new Set(), pendingCycleIds: new Set() };
      await rm(checkpointPath, { force: true });
      const started = await launchHost(exec, input.name, cwd, sessionDirectory, selected, profile, undefined, bridgePath, pause, now);
      paneId = started.paneId;
      const prompt = await runHerdr(exec, ["agent", "prompt", started.host.target, assignmentPrompt(input.assignment!.trim(), checkpointPath, cwd)], IMPLEMENTER_WAIT_SLICE_MS + 30_000);
      if (prompt.code !== 0) throw new Error("Herdr could not submit the implementer assignment.");
      child = await discoverSession(session, input.name, pause, now);
      if (child.cwd && await canonicalDirectory(child.cwd, "Stored implementer cwd") !== cwd) throw new Error("The durable child session cwd does not match the requested project cwd.");
      await waitForProfile(child, profile, pause, now);
      await waitForActionStart(input.name, paneId, child, checkpointPath, cwd, baseline, getAgent, pause, now);
      const delivery = await waitForDelivery(exec, input.name, paneId, child, checkpointPath, cwd, baseline, true, true, getAgent, pause, now);
      const host = (await resolveHost(child)) ?? started.host;
      return await complete("start", child, profile, host ?? null, selected, delivery, delivery.stillWorking ? null : delivery.checkpoint.fresh);
    } catch (error) {
      if (paneId) await closeStoppedPane(exec, paneId, child, getAgent, input.name, cwd, pause, now);
      throw new Error(`Implementer ${paneId ?? input.name} failed: ${errorText(error)}`);
    } finally {
      await rm(bridgePath, { force: true });
    }
  }

  const child = await session();
  if (!child) throw new Error(`Implementer ${input.name} has no durable session in Pinot state; start it first.`);
  if (child.cwd && await canonicalDirectory(child.cwd, "Stored implementer cwd") !== cwd) throw new Error(`Implementer ${input.name} session cwd does not match this lifecycle cwd.`);
  const profile = await recoverProfile(child);
  const selected = await modelForSession(child);

  if (input.action === "resume") {
    await preflightHerdr(exec, cwd);
    const live = await resolveHost(child);
    if (live) throw new Error(`Implementer ${input.name} session ${child.id} still has a live host in pane ${live.paneId}; resume requires no live host.`);
    const baseline = await baselineFor(child, now());
    await waitForGuard(child.path, baseline, pause, now);
    const auth = await resolveLaunchAuth(selected, options.modelRegistry);
    const bridgePath = await writeAuthBridge(sessionDirectory, cwd, selected, auth);
    let paneId: string | undefined;
    try {
      await rm(checkpointPath, { force: true });
      const started = await launchHost(exec, input.name, cwd, sessionDirectory, selected, profile, child, bridgePath, pause, now);
      paneId = started.paneId;
      const prompt = await runHerdr(exec, ["agent", "prompt", started.host.target, assignmentPrompt(input.assignment!.trim(), checkpointPath, cwd)], IMPLEMENTER_WAIT_SLICE_MS + 30_000);
      if (prompt.code !== 0) throw new Error("Herdr could not submit the resumed assignment.");
      await waitForActionStart(input.name, paneId, child, checkpointPath, cwd, baseline, getAgent, pause, now);
      const delivery = await waitForDelivery(exec, input.name, paneId, child, checkpointPath, cwd, baseline, true, true, getAgent, pause, now);
      return await complete("resume", child, profile, (await resolveHost(child)) ?? started.host, selected, delivery, delivery.stillWorking ? null : delivery.checkpoint.fresh);
    } catch (error) {
      if (paneId) await closeStoppedPane(exec, paneId, child, getAgent, input.name, cwd, pause, now);
      throw new Error(`Implementer ${input.name} resume failed: ${errorText(error)}`);
    } finally {
      await rm(bridgePath, { force: true });
    }
  }

  await preflightHerdr(exec, cwd);

  if (input.action === "wait") {
    const baseline = await baselineFor(child, now());
    const host = await resolveHost(child);
    const delivery = await waitForDelivery(exec, input.name, host?.paneId, child, checkpointPath, cwd, baseline, false, false, getAgent, pause, now);
    return await complete("wait", child, profile, (await resolveHost(child)) ?? null, selected, delivery, delivery.stillWorking ? null : delivery.checkpoint.fresh);
  }

  const host = await resolveHost(child);
  if (!host) throw new Error(`Implementer ${input.name} has no verified live host for session ${child.id}; use explicit resume only when the host is absent.`);
  const verified = await verifyHost(host, child);
  if (!verified) throw new Error(`Implementer ${input.name} host no longer matches durable session ${child.id}.`);

  if (input.action === "follow_up") {
    const baseline = await baselineFor(child, now());
    await waitForGuard(child.path, baseline, pause, now);
    await rm(checkpointPath, { force: true });
    const prompt = await runHerdr(exec, ["agent", "prompt", verified.target, assignmentPrompt(input.assignment!.trim(), checkpointPath, cwd)], IMPLEMENTER_WAIT_SLICE_MS + 30_000);
    if (prompt.code !== 0) throw new Error("Herdr could not submit the follow-up assignment.");
    await waitForActionStart(input.name, verified.paneId, child, checkpointPath, cwd, baseline, getAgent, pause, now);
    const delivery = await waitForDelivery(exec, input.name, verified.paneId, child, checkpointPath, cwd, baseline, true, false, getAgent, pause, now);
    return await complete("follow_up", child, profile, (await resolveHost(child)) ?? verified, selected, delivery, delivery.stillWorking ? null : delivery.checkpoint.fresh);
  }

  if (input.action === "compact") {
    if (verified.status !== "idle" && verified.status !== "done") throw new Error(`Implementer ${input.name} is ${verified.status}; compact requires an idle or done child.`);
    const baseline = await baselineFor(child, now());
    await waitForGuard(child.path, baseline, pause, now);
    const rechecked = await resolveHost(child);
    if (!rechecked || rechecked.paneId !== verified.paneId) throw new Error(`Implementer ${input.name} host changed before compact; refusing to submit a stale command.`);
    if (rechecked.status !== "idle" && rechecked.status !== "done") throw new Error(`Implementer ${input.name} became ${rechecked.status}; compact requires an idle or done child.`);
    const prompt = await runHerdr(exec, ["agent", "prompt", rechecked.target, `/${IMPLEMENTER_COMPACT_COMMAND}`], IMPLEMENTER_WAIT_SLICE_MS + 30_000);
    if (prompt.code !== 0) throw new Error("Herdr could not request implementer compaction.");
    await waitForGuard(child.path, baseline, pause, now, true);
    return await complete("compact", child, profile, rechecked, selected, undefined, false);
  }

  if (verified.status === "working") throw new Error(`Implementer ${input.name} is still working; wait for a settled result before close.`);
  const finalHost = await verifyHost(verified, child);
  if (!finalHost) throw new Error(`Implementer ${input.name} host changed; refusing to close the wrong pane.`);
  if (finalHost.status === "working") throw new Error(`Implementer ${input.name} became working; refusing to close it.`);
  if (finalHost.status !== "idle" && finalHost.status !== "done") throw new Error(`Implementer ${input.name} is ${finalHost.status}; close requires a settled idle or done host.`);
  await requireSettledCloseState(input.name, checkpointPath, child.path);
  const recheckedHost = await verifyHost(finalHost, child);
  if (!recheckedHost) throw new Error(`Implementer ${input.name} host changed before close; refusing to close the wrong pane.`);
  if (recheckedHost.status === "working") throw new Error(`Implementer ${input.name} became working; refusing to close it.`);
  if (recheckedHost.status !== "idle" && recheckedHost.status !== "done") throw new Error(`Implementer ${input.name} is ${recheckedHost.status}; close requires a settled idle or done host.`);
  await requireSettledCloseState(input.name, checkpointPath, child.path);
  const closed = await runHerdr(exec, ["pane", "close", recheckedHost.paneId], 30_000);
  if (closed.code !== 0) throw new Error("Herdr could not close the verified implementer host.");
  await waitForHostDisappearance(exec, recheckedHost.paneId, pause, now);
  const preserved = await discoverSession(session, input.name, pause, now);
  if (preserved.id !== child.id || preserved.path !== child.path) throw new Error("Closed pane, but the original durable Pi session was not preserved.");
  return await complete("close", preserved, profile, { ...recheckedHost, status: "closed" }, selected, undefined, null);
}

async function loadPinotConfig(paths: StatePaths): Promise<PinotConfig> {
  try { return parsePinotConfig(await readFile(paths.config, "utf8")); }
  catch (error) { throw new Error(`Pinot configuration is unavailable or invalid: ${errorText(error)}`); }
}

async function discoverSession(session: () => Promise<DurableSession | undefined>, name: string, pause: (milliseconds: number) => Promise<void>, now: () => number): Promise<DurableSession> {
  const deadline = now() + IMPLEMENTER_CHECKPOINT_GRACE_MS;
  while (now() < deadline) {
    const child = await session();
    if (child) return child;
    await pause(IMPLEMENTER_CHECKPOINT_POLL_MS);
  }
  throw new Error(`Implementer ${name} did not create a durable Pi session within the startup grace period; no second prompt or automatic rehost will be attempted.`);
}

async function waitForProfile(session: DurableSession, expected: ImplementerProfile, pause: (milliseconds: number) => Promise<void>, now: () => number): Promise<void> {
  const deadline = now() + IMPLEMENTER_CHECKPOINT_GRACE_MS;
  let lastError = "profile metadata is missing";
  while (now() < deadline) {
    try {
      const actual = recoverImplementerProfileFromJsonl(await readFile(session.path, "utf8"));
      if (!actual) throw new Error("profile metadata is missing");
      if (actual !== expected) throw new Error(`profile metadata is ${actual}, expected ${expected}`);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (/conflicts|corrupt|invalid|expected/.test(lastError)) throw new Error(`Implementer ${session.id} profile recovery failed: ${lastError}.`);
      if (now() < deadline) await pause(IMPLEMENTER_CHECKPOINT_POLL_MS);
    }
  }
  throw new Error(`Implementer ${session.id} did not record immutable profile metadata: ${lastError}.`);
}

async function waitForGuardIfAvailable(path: string, baseline: GuardBaseline, pause: (milliseconds: number) => Promise<void>, now: () => number): Promise<void> {
  await waitForGuard(path, baseline, pause, now);
}

async function waitForActionStart(
  name: string,
  paneId: string,
  child: DurableSession,
  checkpointPath: string,
  cwd: string,
  baseline: GuardBaseline,
  getAgent: (target: string) => Promise<unknown>,
  pause: (milliseconds: number) => Promise<void>,
  now: () => number,
): Promise<void> {
  const deadline = now() + IMPLEMENTER_CHECKPOINT_GRACE_MS;
  let lastStatus = "unknown";
  while (now() < deadline) {
    try {
      const agent = await getAgent(paneId);
      const host = hostFrom(agent, "pane", name);
      if (!host || host.paneId !== paneId || agentName(agent) !== name || !await hostMatchesCwd(agent, cwd)) {
        throw new Error("Implementer host identity changed while starting the assignment.");
      }
      const reference = agentSessionReference(agent);
      if (reference.path || reference.id) {
        if (!await hostMatchesSession(agent, child)) throw new Error("Implementer host identity changed while starting the assignment.");
        lastStatus = host.status;
        if (host.status === "working") return;
      } else {
        lastStatus = "awaiting session identity";
      }
      const checkpoint = await checkpointDetails(checkpointPath, null);
      const guard = await readGuard(child.path);
      const freshGuard = guard.cycles.some((cycle) => !baseline.cycleIds.has(cycle.cycleId) && guardCycleTime(cycle) >= baseline.actionStartedAt);
      if ((reference.path || reference.id) && ((checkpoint.present && checkpoint.mtimeMs !== null && checkpoint.mtimeMs >= baseline.actionStartedAt) || freshGuard)) return;
    } catch (error) {
      if (/identity changed/.test(errorText(error))) throw error;
    }
    if (now() < deadline) await pause(IMPLEMENTER_CHECKPOINT_POLL_MS);
  }
  throw new Error(`Implementer ${name} prompt did not start an action on the verified pane within the bounded startup wait (last status: ${lastStatus}).`);
}

async function waitForDelivery(
  exec: ExtensionAPI["exec"],
  name: string,
  initialPaneId: string | undefined,
  child: DurableSession,
  checkpointPath: string,
  cwd: string,
  baseline: GuardBaseline,
  fresh: boolean,
  cleanup: boolean,
  getAgent: (target: string) => Promise<unknown>,
  pause: (milliseconds: number) => Promise<void>,
  now: () => number,
): Promise<ImplementerDelivery> {
  const startedAt = now();
  if (initialPaneId) {
    try {
      const agent = await getAgent(initialPaneId);
      const host = hostFrom(agent, "pane", name);
      if (!host || host.paneId !== initialPaneId || agentName(agent) !== name || !await hostMatchesSession(agent, child) || !await hostMatchesCwd(agent, cwd)) {
        throw new Error("Implementer host identity changed while delivering the assignment.");
      }
      if (host.status === "working") await waitForHerdrAgent(exec, name);
      try {
        const settled = await getAgent(initialPaneId);
        const settledHost = hostFrom(settled, "pane", name);
        if (!settledHost || settledHost.paneId !== initialPaneId || agentName(settled) !== name || !await hostMatchesSession(settled, child) || !await hostMatchesCwd(settled, cwd)) {
          throw new Error("Implementer host identity changed while delivering the assignment.");
        }
        if (settledHost.status === "working") return { stillWorking: true, elapsedSeconds: Math.max(0, Math.round((now() - startedAt) / 1_000)), paneId: initialPaneId };
      } catch (error) {
        if (/identity changed/.test(errorText(error))) throw error;
        // A host that disappeared can still leave a durable session/checkpoint; verify that handoff below.
      }
    } catch (error) {
      if (/identity changed|could not wait/.test(errorText(error))) throw error;
      // A stopped host is handled by checkpoint delivery or an explicit lifecycle error below.
    }
  }
  await waitForGuard(child.path, baseline, pause, now);
  try {
    const checkpoint = await waitForCheckpoint(checkpointPath, name, fresh ? "fresh assignment" : "update", fresh ? baseline.actionStartedAt : undefined, pause, now);
    return { stillWorking: false, checkpoint, paneId: initialPaneId ?? "unknown" };
  } catch (error) {
    if (cleanup && initialPaneId && isCheckpointError(error)) await closeStoppedPane(exec, initialPaneId, child, getAgent, name, cwd, pause, now);
    throw error;
  }
}

async function startHost(exec: ExtensionAPI["exec"], name: string, paneId: string, cwd: string, sessionDirectory: string, selected: SelectedImplementerModel, profile: ImplementerProfile, child: DurableSession | undefined): Promise<unknown> {
  const sessionArgs = child?.legacy ? ["--session", child.path] : ["--session-id", child?.id ?? name];
  const profileArgs = profile === "janitor" ? ["--skill", SUPPORT_JANITOR_SKILL] : [];
  const args = [
    "agent", "start", name, "--kind", "pi", "--pane", paneId, "--timeout", "120000", "--",
    "--name", name,
    "--model", `${selected.provider}/${selected.model}`,
    "--thinking", selected.thinking,
    ...sessionArgs,
    "--session-dir", sessionDirectory,
    "--no-extensions",
    "-e", SUPPORT_HERDR_STATE,
    "-e", SUPPORT_IMPLEMENTER_AUTH,
    "-e", SUPPORT_CONTEXT_GUARD,
    "--no-skills",
    ...profileArgs,
    "--no-prompt-templates",
    "--no-context-files",
    "--append-system-prompt", SUPPORT_SYSTEM_PROMPT,
  ];
  let result: HerdrResult | undefined;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    result = await runHerdr(exec, args, 150_000);
    if (result.code === 0) break;
    if (!/agent_pane_busy|not an available shell/i.test(`${result.stdout}\n${result.stderr}`)) break;
    await new Promise<void>((resolvePause) => setTimeout(resolvePause, 150));
  }
  if (!result || result.code !== 0) throw new Error("Herdr could not start the Pi implementer.");
  try {
    const value = JSON.parse(result.stdout);
    return value?.result?.agent ?? value?.agent;
  } catch {
    throw new Error("Herdr returned an invalid implementer start record.");
  }
}

async function launchHost(exec: ExtensionAPI["exec"], name: string, cwd: string, sessionDirectory: string, selected: SelectedImplementerModel, profile: ImplementerProfile, child: DurableSession | undefined, bridgePath: string, pause: (milliseconds: number) => Promise<void>, now: () => number): Promise<{ paneId: string; host: ImplementerHost }> {
  const split = await runHerdr(exec, ["pane", "split", "--current", "--direction", "right", "--cwd", cwd, "--env", `${IMPLEMENTER_LIFECYCLE_OWNER_MARKER}=`, "--env", `${IMPLEMENTER_CHILD_MARKER}=1`, "--env", `${IMPLEMENTER_AUTH_BRIDGE}=${bridgePath}`, "--env", `${IMPLEMENTER_PROVIDER}=${selected.provider}`, "--env", `${IMPLEMENTER_MODEL}=${selected.model}`, "--env", `${IMPLEMENTER_PROFILE_ENV}=${profile}`, "--no-focus"], 30_000);
  if (split.code !== 0) throw new Error("Herdr could not create the implementer pane.");
  let paneId: unknown;
  try { paneId = JSON.parse(split.stdout)?.result?.pane?.pane_id; } catch { paneId = undefined; }
  if (typeof paneId !== "string" || !paneId) throw new Error("Herdr pane split returned no pane identity.");
  try {
    const agent = await startHost(exec, name, paneId, cwd, sessionDirectory, selected, profile, child);
    const host = hostFrom(agent, "pane", name);
    if (!host || host.paneId !== paneId || agentName(agent) !== name || !await hostMatchesCwd(agent, cwd)) throw new Error("Herdr returned an implementer host with an unverifiable identity.");
    return { paneId, host };
  } catch (error) {
    try { await closeCreatedPane(exec, paneId, pause, now); }
    catch (cleanupError) { throw new Error(`Implementer pane startup failed; cleanup failed: ${errorText(cleanupError)}`); }
    throw error;
  }
}

export function registerImplementerTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "pinot_native_herdr_implementer",
    label: "Pinot Native Herdr Implementer",
    description: "Run one durable Herdr-backed Pi implementer through an explicit start, resume, follow_up, compact, wait, or close lifecycle.",
    promptSnippet: "Use the durable Pinot Herdr implementer for one bounded writing assignment; never fall back to main-agent editing when it is unavailable.",
    promptGuidelines: [
      "Use pinot_native_herdr_implementer for one bounded implementation assignment that needs a durable Pi child.",
      "Profile selection is start-only: implementation is the default; select janitor only for a fresh Janitor start, which explicitly loads the package-owned skill.",
      "The Pi session is the durable child identity and the Herdr name/pane is the current host attachment; retain both across lifecycle calls and verify immutable profile metadata.",
      "Use resume only when the matching host is absent. A still-working result means call wait again and never close the agent.",
      "Use close only for the verified matching host; close preserves the child session. Do not substitute main-agent editing when Herdr prerequisites fail.",
    ],
    parameters: ImplementerSchema,
    executionMode: "sequential",
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const result = await runImplementer(params as ImplementerInput, params.cwd ?? ctx.cwd, {
        modelRegistry: ctx.modelRegistry,
        exec: pi.exec.bind(pi),
      });
      return { content: [{ type: "text" as const, text: result.content }], details: result.details };
    },
  });
}

export function contextMeasurementForUsage(value: { tokens?: unknown; contextWindow?: unknown; percent?: unknown } | undefined): ImplementerContextMeasurement {
  const snapshot = contextSnapshot(value);
  return { ...snapshot, status: snapshot.percent === null ? "unknown" : "known", atOrAboveCap: snapshot.percent === null ? null : snapshot.percent >= 80 };
}
