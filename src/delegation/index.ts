import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { getModel as getBuiltinModel } from "@earendil-works/pi-ai/compat";
import type { ExtensionAPI, ModelRegistry } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { parseModelReference } from "../config/status.ts";
import { parsePinotConfig, type PinotConfig } from "../config/types.ts";
import { resolveStatePaths } from "../state/paths.ts";
import { DELEGATION_ROLES, validateAssignment, type DelegationAssignment, type DelegationRole } from "./contract.ts";
import { checkpointFromWorkerText, type Checkpoint } from "./checkpoint-parser.ts";
import { boundedResultText } from "./limits.ts";
import { formatProgress, runWorkerProcess, type WorkerProcessInfo, type WorkerProgress, type WorkerUsage } from "./worker-process.ts";

export const DEFAULT_TIMEOUT_SECONDS = 1_800;
export const MAX_TIMEOUT_SECONDS = 3_600;
export const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"] as const;
const CHILD_BOOTSTRAP = new URL("./child-bootstrap.ts", import.meta.url);

export const AssignmentSchema = Type.Object({
  role: Type.Union(DELEGATION_ROLES.map((role) => Type.Literal(role))),
  objective: Type.String({ minLength: 12, maxLength: 800 }),
  nonObjectives: Type.Array(Type.String({ minLength: 3, maxLength: 300 }), { minItems: 1, maxItems: 8 }),
  boundary: Type.Object({
    pathsOrSubsystems: Type.Array(Type.String({ minLength: 1, maxLength: 300 }), { minItems: 1, maxItems: 8 }),
    evidenceScope: Type.String({ minLength: 8, maxLength: 600 }),
    externalSources: Type.Optional(Type.Array(Type.String({ minLength: 8, maxLength: 500 }), { maxItems: 8 })),
  }, { additionalProperties: false }),
  editingPermission: Type.Boolean(),
  expectedReportFormat: Type.Literal("checkpoint-v4"),
  verificationRequired: Type.Union([Type.Literal("none"), Type.Literal("evidence-review")]),
  stopConditions: Type.Array(Type.String({ minLength: 3, maxLength: 300 }), { minItems: 1, maxItems: 8 }),
  durableOutput: Type.Literal("parent-tool-result"),
  timeoutSeconds: Type.Optional(Type.Integer({ minimum: 5, maximum: MAX_TIMEOUT_SECONDS })),
}, { additionalProperties: false });

export type AssignmentInput = Static<typeof AssignmentSchema>;

export interface DelegationProcess extends WorkerProcessInfo {}

/** Internal result retained only inside the extension before public serialization. */
export interface InternalDelegationDetails {
  assignment: DelegationAssignment;
  checkpoint: Checkpoint;
  worker: {
    model: string;
    usage: WorkerUsage;
    elapsedMs: number;
    toolNames: string[];
    process: DelegationProcess;
    progress: WorkerProgress;
  };
  isolation: "ephemeral process; isolated Pi config/session; no write/edit/bash";
  settingsFingerprint: { before: string; after: string; unchanged: boolean };
}

export interface PublicDelegationDetails {
  role: DelegationRole;
  model: string;
  usage: WorkerUsage;
  elapsedMs: number;
  process: Omit<DelegationProcess, "outcome" | "closure"> & { outcome: DelegationProcess["outcome"] | "running"; closure: DelegationProcess["closure"] | "open" };
  progress: WorkerProgress;
  checkpoint: { status: Checkpoint["status"]; findingCount: number; evidenceCount: number; unknownCount: number; confidence: Checkpoint["confidence"] };
  settingsUnchanged: boolean;
  failure: boolean;
  closure: DelegationProcess["closure"] | "open";
}

export type DelegationDetails = InternalDelegationDetails;
const redactionSecrets = new WeakMap<object, string[]>();

export interface DelegationRunOptions {
  modelRegistry: Pick<ModelRegistry, "find" | "getProvider" | "getProviderAuth" | "getRegisteredProviderConfig" | "getRegisteredNativeProvider">;
  config?: PinotConfig;
  signal?: AbortSignal;
  onUpdate?: (progress: WorkerProgress, meta: { model: string; deadlineMs: number }) => void;
  spawnProcess?: Parameters<typeof runWorkerProcess>[0]["spawnProcess"];
  executable?: string;
  settingsPath?: string;
}

function initialCheckpoint(): Checkpoint {
  return { status: "blocked", findings: ["Worker did not start."], evidence: [], verification: "Not performed.", confidence: "low", unknowns: ["No worker result."] };
}

function workerPrompt(assignment: DelegationAssignment, timeoutSeconds: number): string {
  const reserve = Math.min(60, Math.max(1, Math.floor(timeoutSeconds / 5)));
  const guidance: Record<DelegationRole, string> = {
    scout: "Map only the assigned evidence. Locate and summarize; do not decide product direction. Stop rather than expanding the boundary.",
    assessor: "Assess only the supplied plan or approach against requirements and evidence. Separate blockers from optional improvements and prefer the smallest adequate design.",
    "second-opinion": "Independently re-evaluate only the consequential question or claim. Report only findings that could change acceptance; plainly report no material disagreement.",
    reviewer: "Return prioritized, actionable findings tied to supplied requirements and evidence, not a generic style review. Do not invent out-of-scope complexity.",
    verifier: "This is evidence-only. Do not run commands or claim execution. Distinguish observed behavior from internal state and state GUI limitations without visual evidence.",
  };
  return `You are an ephemeral, read-only Pi background worker. Do not edit, write files, run shell commands, delegate, ask questions, or broaden scope. Your only durable output is the final checkpoint to the parent.\n\nHard process deadline: ${timeoutSeconds} seconds. Stop evidence gathering with ${reserve} seconds remaining and return the best checkpoint available.\n\nRole: ${assignment.role}\n${guidance[assignment.role]}\n\nObjective: ${assignment.objective}\nNon-objectives:\n${assignment.nonObjectives.map((item) => `- ${item}`).join("\n")}\nBoundary paths/subsystems:\n${assignment.boundary.pathsOrSubsystems.map((item) => `- ${item}`).join("\n")}\nEvidence scope: ${assignment.boundary.evidenceScope}\n${assignment.boundary.externalSources?.length ? `Allowed external sources:\n${assignment.boundary.externalSources.map((item) => `- ${item}`).join("\n")}\n` : ""}Verification required: ${assignment.verificationRequired}\nStop/escalate when:\n${assignment.stopConditions.map((item) => `- ${item}`).join("\n")}\n\nEnd with one checkpoint-v4 JSON object, bare or in one json fence, with exactly this shape:\n{"status":"completed|incomplete|blocked","findings":["concise finding"],"evidence":["path, URL, or line location"],"verification":"what was checked or why unavailable","confidence":"high|medium|low","unknowns":["remaining uncertainty"],"escalationQuestion":"optional concise question"}`;
}

function validateAuthResult(provider: string, value: unknown): { apiKey: string; headers?: Record<string, string>; baseUrl?: string; env?: Record<string, string> } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Authentication unavailable for provider "${provider}".`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !["auth", "env", "source"].includes(key))) throw new Error("Selected provider returned unsupported authentication metadata.");
  if (!result.auth || typeof result.auth !== "object" || Array.isArray(result.auth)) throw new Error(`Authentication unavailable for provider "${provider}".`);
  const auth = result.auth as Record<string, unknown>;
  if (Object.keys(auth).some((key) => !["apiKey", "headers", "baseUrl"].includes(key))) throw new Error("Selected provider authentication shape is unsupported.");
  if (typeof auth.apiKey !== "string" || !auth.apiKey) throw new Error(`Authentication unavailable for provider "${provider}".`);
  let headers: Record<string, string> | undefined;
  if (auth.headers !== undefined) {
    if (!auth.headers || typeof auth.headers !== "object" || Array.isArray(auth.headers)) throw new Error("Selected provider headers are unsupported.");
    const values = Object.entries(auth.headers as Record<string, unknown>);
    if (values.some(([key, item]) => !key || typeof item !== "string")) throw new Error("Selected provider headers are unsupported.");
    headers = Object.fromEntries(values) as Record<string, string>;
  }
  if (auth.baseUrl !== undefined && typeof auth.baseUrl !== "string") throw new Error("Selected provider base URL is unsupported.");
  let env: Record<string, string> | undefined;
  if (result.env !== undefined) {
    if (!result.env || typeof result.env !== "object" || Array.isArray(result.env)) throw new Error("Selected provider environment is unsupported.");
    const values = Object.entries(result.env as Record<string, unknown>);
    if (values.some(([key, item]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof item !== "string")) throw new Error("Selected provider environment is unsupported.");
    env = Object.fromEntries(values) as Record<string, string>;
  }
  return { apiKey: auth.apiKey, ...(headers ? { headers } : {}), ...(typeof auth.baseUrl === "string" ? { baseUrl: auth.baseUrl } : {}), ...(env ? { env } : {}) };
}

async function fingerprint(path: string | undefined): Promise<string> {
  if (!path) return "not-checked";
  try { return createHash("sha256").update(await readFile(path)).digest("hex"); } catch { return "missing"; }
}

async function canonicalRoot(cwd: string): Promise<string> {
  return (await import("node:fs/promises")).realpath(cwd);
}

function extensionReference(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, canonicalValue((value as Record<string, unknown>)[key])]));
  }
  return value;
}

function isExactBuiltInModel(provider: string, modelId: string, model: unknown): boolean {
  let builtIn: unknown;
  try { builtIn = getBuiltinModel(provider as never, modelId as never); } catch { return false; }
  return Boolean(builtIn) && JSON.stringify(canonicalValue(model)) === JSON.stringify(canonicalValue(builtIn));
}

export function resolvePiInvocation(options: DelegationRunOptions): { executable: string; argsPrefix: string[] } {
  const configured = options.executable || process.env.PINOT_PI_EXECUTABLE;
  if (configured) return { executable: configured, argsPrefix: [] };
  const entry = process.env.PI_CODING_AGENT_ENTRY || process.argv[1];
  if (entry && isAbsolute(entry) && existsSync(entry) && /^(?:pi|pi\.m?js)$/i.test(basename(entry))) return { executable: process.execPath, argsPrefix: [entry] };
  return { executable: "pi", argsPrefix: [] };
}

async function createWorkspace(root: string, bridge: object, prompt: string): Promise<{ workspace: string; bridgePath: string; promptPath: string; agentDir: string; sessionDir: string }> {
  const workspace = await mkdtemp(join(tmpdir(), "pinot-background-"));
  try {
    const agentDir = join(workspace, "agent");
    const sessionDir = join(workspace, "sessions");
    await (await import("node:fs/promises")).mkdir(agentDir, { recursive: true, mode: 0o700 });
    await (await import("node:fs/promises")).mkdir(sessionDir, { recursive: true, mode: 0o700 });
    const bridgePath = join(workspace, "credential-bridge.json");
    const promptPath = join(workspace, "worker-instructions.txt");
    await writeFile(bridgePath, `${JSON.stringify(bridge)}\n`, { mode: 0o600 });
    await chmod(bridgePath, 0o600);
    await writeFile(promptPath, prompt, { mode: 0o600 });
    await chmod(promptPath, 0o600);
    return { workspace, bridgePath, promptPath, agentDir, sessionDir };
  } catch (error) {
    await rm(workspace, { recursive: true, force: true });
    throw error;
  }
}

function childEnvironment(workspace: string, agentDir: string, sessionDir: string, bridgePath: string, root: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: workspace,
    TMPDIR: process.env.TMPDIR,
    LANG: process.env.LANG,
    LC_ALL: process.env.LC_ALL,
    PI_CODING_AGENT_DIR: agentDir,
    PI_CODING_AGENT_SESSION_DIR: sessionDir,
    PINOT_CREDENTIAL_BRIDGE: bridgePath,
    PINOT_WORKER_ROOT: root,
    PI_OFFLINE: "1",
    PI_SKIP_VERSION_CHECK: "1",
    PI_TELEMETRY: "0",
  };
  return Object.fromEntries(Object.entries(env).filter(([, value]) => value !== undefined));
}

function redactCheckpoint(checkpoint: Checkpoint, secrets: string[]): Checkpoint {
  const redact = (value: string) => {
    let text = value;
    for (const secret of secrets) if (secret) text = text.split(secret).join("[redacted]");
    return text.replace(/(?:api[_-]?key|token|secret|authorization|bearer)[=: \t]+[^\s,;]+/gi, "[redacted]");
  };
  return {
    ...checkpoint,
    findings: checkpoint.findings.map(redact),
    evidence: checkpoint.evidence.map(redact),
    verification: redact(checkpoint.verification),
    unknowns: checkpoint.unknowns.map(redact),
    ...(checkpoint.escalationQuestion ? { escalationQuestion: redact(checkpoint.escalationQuestion) } : {}),
  };
}

function processCheckpoint(processInfo: WorkerProcessInfo, timeoutSeconds: number, terminalText: string, secrets: string[]): Checkpoint {
  const parsed = terminalText ? checkpointFromWorkerText(terminalText) : undefined;
  if (parsed) return redactCheckpoint(parsed, secrets);
  let fallback: Checkpoint;
  if (processInfo.outcome === "timed_out") fallback = { status: "incomplete", findings: [`Worker timed out after ${timeoutSeconds}s; process metadata is available.`], evidence: [], verification: "Not completed.", confidence: "low", unknowns: ["No accepted structured worker report."] };
  else if (processInfo.outcome === "cancelled") fallback = { status: "incomplete", findings: ["Worker was cancelled by the parent; process metadata is available."], evidence: [], verification: "Not completed.", confidence: "low", unknowns: ["No accepted structured worker report."] };
  else if (processInfo.outcome === "spawn_failed") fallback = { status: "blocked", findings: ["Worker could not be started."], evidence: [], verification: "Not performed.", confidence: "low", unknowns: ["Worker was not available."], escalationQuestion: "Is the configured Pi executable available?" };
  else if (processInfo.outcome === "exited_nonzero") fallback = { status: "blocked", findings: ["Worker exited without an accepted checkpoint."], evidence: [], verification: "Not completed.", confidence: "low", unknowns: ["No accepted structured worker report."] };
  else fallback = initialCheckpoint();
  return redactCheckpoint(fallback, secrets);
}

function publicProgress(progress: WorkerProgress): WorkerProgress {
  const currentTool = progress.currentTool && ["read", "grep", "find", "ls", "web_search", "fetch_content"].includes(progress.currentTool) ? progress.currentTool : undefined;
  const { currentTool: _ignoredTool, ...mechanicalProgress } = progress;
  return { ...mechanicalProgress, ...(currentTool ? { currentTool } : {}) };
}

export function toPublicDetails(details: InternalDelegationDetails): PublicDelegationDetails {
  return {
    role: details.assignment.role,
    model: details.worker.model.slice(0, 300),
    usage: details.worker.usage,
    elapsedMs: details.worker.elapsedMs,
    process: details.worker.process,
    progress: publicProgress(details.worker.progress),
    checkpoint: {
      status: details.checkpoint.status,
      findingCount: details.checkpoint.findings.length,
      evidenceCount: details.checkpoint.evidence.length,
      unknownCount: details.checkpoint.unknowns.length,
      confidence: details.checkpoint.confidence,
    },
    settingsUnchanged: details.settingsFingerprint.unchanged,
    failure: details.worker.process.outcome !== "completed",
    closure: details.worker.process.closure,
  };
}

export function publicUpdateDetails(role: DelegationRole, model: string, progress: WorkerProgress, deadlineMs: number): PublicDelegationDetails {
  return {
    role,
    model,
    usage: progress.usage,
    elapsedMs: progress.elapsedMs,
    process: { outcome: "running", deadlineMs, killAttempted: false, closure: "open" },
    progress: publicProgress(progress),
    checkpoint: { status: "incomplete", findingCount: 0, evidenceCount: 0, unknownCount: 0, confidence: "low" },
    settingsUnchanged: true,
    failure: false,
    closure: "open",
  } as PublicDelegationDetails;
}

export async function runDelegation(assignment: DelegationAssignment, cwd: string, options: DelegationRunOptions): Promise<DelegationDetails> {
  const assignmentError = validateAssignment(assignment);
  if (assignmentError) throw new Error(assignmentError);
  const config = options.config ?? await loadConfig();
  const external = assignment.boundary.externalSources?.length ? extensionReference(config.externalSourceExtension) : undefined;
  if (assignment.boundary.externalSources?.length && !external) throw new Error("External-source scouting requires an explicitly configured compatible extension; no web capability is bundled.");
  const reference = config.models[assignment.role];
  if (!reference) throw new Error(`No model is configured for the ${assignment.role} role.`);
  const parsed = parseModelReference(reference);
  if (!parsed) throw new Error(`The ${assignment.role} model mapping is invalid.`);
  const model = options.modelRegistry.find(parsed.provider, parsed.model);
  if (!model) throw new Error(`Configured model ${parsed.provider}/${parsed.model} is unavailable.`);
  if (!isExactBuiltInModel(parsed.provider, parsed.model, model)) throw new Error(`Configured model ${parsed.provider}/${parsed.model} is not an exact built-in catalog model; custom models, overrides, and compatibility settings are unsupported.`);
  if (options.modelRegistry.getRegisteredProviderConfig(parsed.provider) !== undefined || options.modelRegistry.getRegisteredNativeProvider(parsed.provider) !== undefined) {
    throw new Error(`Provider "${parsed.provider}" uses custom provider behavior and is unsupported for isolated delegation.`);
  }
  if (!options.modelRegistry.getProvider(parsed.provider)) throw new Error(`Provider "${parsed.provider}" is unavailable.`);
  let rawAuth: unknown;
  try {
    rawAuth = await options.modelRegistry.getProviderAuth(parsed.provider);
  } catch {
    throw new Error(`Authentication for provider "${parsed.provider}" is unavailable.`);
  }
  const auth = validateAuthResult(parsed.provider, rawAuth);
  const root = await canonicalRoot(cwd);
  const timeoutSeconds = assignment.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  const before = await fingerprint(options.settingsPath);
  const started = Date.now();
  let workspace: Awaited<ReturnType<typeof createWorkspace>> | undefined;
  let processInfo: WorkerProcessInfo = { outcome: "spawn_failed", deadlineMs: timeoutSeconds * 1000, killAttempted: false, closure: "pre_spawn" };
  let progress: WorkerProgress = { elapsedMs: 0, lastActivityElapsedMs: 0, phase: "starting", turns: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0, turns: 0 } };
  let usage = progress.usage;
  let checkpoint = initialCheckpoint();
  const toolNames = [...READ_ONLY_TOOLS];
  try {
    workspace = await createWorkspace(root, {
      version: 1,
      provider: parsed.provider,
      model: parsed.model,
      root,
      auth: { apiKey: auth.apiKey, ...(auth.headers ? { headers: auth.headers } : {}), ...(auth.baseUrl ? { baseUrl: auth.baseUrl } : {}) },
      ...(auth.env ? { env: auth.env } : {}),
    }, workerPrompt(assignment, timeoutSeconds));
    const invocation = resolvePiInvocation(options);
    const args = [...invocation.argsPrefix, "--mode", "json", "--print", "--no-session", "--no-extensions", "--extension", (await import("node:url")).fileURLToPath(CHILD_BOOTSTRAP), "--no-skills", "--no-prompt-templates", "--no-context-files", "--tools", toolNames.join(","), "--model", `${parsed.provider}/${parsed.model}`, "--thinking", parsed.thinking, "--append-system-prompt", workspace.promptPath];
    if (external) args.push("--extension", external, "--tools", [...toolNames, "web_search", "fetch_content"].join(","));
    args.push("Return the required checkpoint-v4 report.");
    const result = await runWorkerProcess({ executable: invocation.executable, args, cwd: root, env: childEnvironment(workspace.workspace, workspace.agentDir, workspace.sessionDir, workspace.bridgePath, root), deadlineMs: timeoutSeconds * 1000, signal: options.signal, spawnProcess: options.spawnProcess, onProgress: (next) => { progress = next; options.onUpdate?.(next, { model: reference, deadlineMs: timeoutSeconds * 1000 }); } });
    processInfo = result.process;
    progress = result.progress;
    usage = result.usage;
    checkpoint = processCheckpoint(result.process, timeoutSeconds, result.terminalText, [
      auth.apiKey,
      ...Object.values(auth.headers ?? {}),
      ...(auth.baseUrl ? [auth.baseUrl] : []),
      ...Object.values(auth.env ?? {}),
      workspace.workspace,
      workspace.bridgePath,
      workspace.promptPath,
      workspace.agentDir,
      workspace.sessionDir,
    ]);
  } finally {
    if (workspace) await rm(workspace.workspace, { recursive: true, force: true });
  }
  const after = await fingerprint(options.settingsPath);
  const details: InternalDelegationDetails = { assignment, checkpoint, worker: { model: reference, usage, elapsedMs: Date.now() - started, toolNames, process: processInfo, progress }, isolation: "ephemeral process; isolated Pi config/session; no write/edit/bash", settingsFingerprint: { before, after, unchanged: before === after } };
  redactionSecrets.set(details, [
    auth.apiKey,
    ...Object.values(auth.headers ?? {}),
    ...(auth.baseUrl ? [auth.baseUrl] : []),
    ...Object.values(auth.env ?? {}),
    workspace?.workspace ?? "",
    workspace?.bridgePath ?? "",
    workspace?.promptPath ?? "",
    workspace?.agentDir ?? "",
    workspace?.sessionDir ?? "",
  ]);
  return details;
}

async function loadConfig(): Promise<PinotConfig> {
  const paths = resolveStatePaths();
  try { return parsePinotConfig(await readFile(paths.config, "utf8")); }
  catch (error) { throw new Error(`Pinot config is unavailable or invalid: ${error instanceof Error ? error.message : String(error)}`); }
}

export function compactResult(details: DelegationDetails): string {
  const { checkpoint, worker } = details;
  const secrets = redactionSecrets.get(details) ?? [];
  const redact = (value: string) => {
    let text = value;
    for (const secret of secrets) if (secret) text = text.split(secret).join("[redacted]");
    return text
      .replace(/\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|bearer)\s*(?:[:=]|\s)\s*[^\s,;]+/gi, "[redacted-credential]")
      .replace(/\/tmp\/pinot-background-[^\s;]+/g, "[redacted-temp-handoff]");
  };
  const processLabel = worker.process.outcome === "timed_out" ? `timed_out after ${Math.round(worker.process.deadlineMs / 1000)}s` : worker.process.outcome;
  const lines = [
    `Background ${details.assignment.role}: ${checkpoint.status}`,
    `Checkpoint outcome: ${checkpoint.status}; process outcome: ${processLabel}.`,
    ...checkpoint.findings.map((item) => `- ${redact(item).slice(0, 800)}`),
    `Evidence: ${checkpoint.evidence.map((item) => redact(item).slice(0, 800)).join("; ") || "none reported"}`,
    `Verification: ${redact(checkpoint.verification).slice(0, 800)}`,
    `Confidence: ${checkpoint.confidence}. Unknowns: ${checkpoint.unknowns.map((item) => redact(item).slice(0, 800)).join("; ") || "none reported"}`,
    `Worker usage: ${worker.usage.turns} turn(s), ${worker.usage.totalTokens} tokens, $${worker.usage.cost.toFixed(4)}, ${Math.round(worker.elapsedMs / 1000)}s.`,
    ...(worker.process.shutdownMs === undefined ? [] : [`Shutdown: ${worker.process.shutdownMs}ms${worker.process.killAttempted ? " (kill attempted)" : ""}.`]),
    ...(checkpoint.escalationQuestion ? [`Escalation: ${redact(checkpoint.escalationQuestion).slice(0, 500)}`] : []),
    ...(details.settingsFingerprint.unchanged ? [] : ["Safety alert: global Pi settings changed during worker run."]),
  ];
  return boundedResultText(lines.join("\n"));
}

export function toolUsage(usage: WorkerUsage) {
  return {
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    totalTokens: usage.totalTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: usage.cost },
  };
}

export function registerDelegationTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "pinot_delegate_background",
    label: "Pinot Delegate Background",
    description: "Run one bounded, ephemeral, read-only scout, assessor, second-opinion, reviewer, or evidence-only verifier.",
    promptSnippet: "Delegate one bounded read-only scouting, assessment, review, or evidence-only verification task.",
    promptGuidelines: [
      "Use pinot_delegate_background only for one-shot work that is bounded, read-only, unlikely to need clarification, and can report as checkpoint-v4.",
      "pinot_delegate_background cannot edit, run bash, recursively delegate, perform GUI work, or resume; use a durable implementer path for those needs.",
      "Read the compact checkpoint as a lead, then inspect load-bearing evidence directly before making consequential decisions.",
      "pinot_delegate_background uses configured role models and a single-provider temporary credential bridge; it never reads or falls back to the user's full auth/settings files.",
    ],
    parameters: AssignmentSchema,
    executionMode: "sequential",
    async execute(_id, params, signal, onUpdate, ctx) {
      const details = await runDelegation(params as DelegationAssignment, ctx.cwd, {
        modelRegistry: ctx.modelRegistry,
        signal,
        onUpdate: (progress, meta) => onUpdate?.({ content: [{ type: "text", text: formatProgress(progress) }], details: publicUpdateDetails(params.role as DelegationRole, meta.model, progress, meta.deadlineMs) }),
        settingsPath: join((await import("@earendil-works/pi-coding-agent")).getAgentDir(), "settings.json"),
      });
      return { content: [{ type: "text", text: compactResult(details) }], details: toPublicDetails(details), usage: toolUsage(details.worker.usage) };
    },
  });
}
