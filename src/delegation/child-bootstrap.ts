import { readFile, realpath, unlink } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { boundedResultText, MAX_OUTPUT_BYTES, MAX_OUTPUT_LINES } from "./limits.ts";

export interface CredentialBridge {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseBridge(value: unknown): CredentialBridge {
  if (!isRecord(value) || value.version !== 1 || typeof value.provider !== "string" || typeof value.model !== "string" || typeof value.root !== "string" || !isRecord(value.auth) || typeof value.auth.apiKey !== "string" || !value.auth.apiKey) {
    throw new Error("credential bridge is invalid");
  }
  const auth = value.auth;
  if (auth.headers !== undefined && (!isRecord(auth.headers) || Object.values(auth.headers).some((item) => typeof item !== "string"))) throw new Error("credential bridge headers are unsupported");
  if (auth.baseUrl !== undefined && typeof auth.baseUrl !== "string") throw new Error("credential bridge base URL is unsupported");
  if (value.env !== undefined && (!isRecord(value.env) || Object.entries(value.env).some(([key, item]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof item !== "string"))) throw new Error("credential bridge environment is unsupported");
  return {
    version: 1,
    provider: value.provider as string,
    model: value.model as string,
    root: value.root as string,
    auth: {
      apiKey: auth.apiKey as string,
      ...(auth.headers ? { headers: auth.headers as Record<string, string> } : {}),
      ...(typeof auth.baseUrl === "string" ? { baseUrl: auth.baseUrl } : {}),
    },
    ...(value.env ? { env: value.env as Record<string, string> } : {}),
  };
}

/** Read once, unlink immediately, then install the selected provider override. */
export async function consumeCredentialBridge(path: string, pi: Pick<ExtensionAPI, "registerProvider">): Promise<CredentialBridge> {
  let bridge: CredentialBridge;
  try {
    bridge = parseBridge(JSON.parse(await readFile(path, "utf8")));
  } catch {
    throw new Error("credential bridge unavailable or invalid");
  } finally {
    try { await unlink(path); } catch { /* Parent cleanup remains authoritative. */ }
  }
  for (const [key, value] of Object.entries(bridge.env ?? {})) process.env[key] = value;
  pi.registerProvider(bridge.provider, {
    apiKey: bridge.auth.apiKey,
    ...(bridge.auth.headers ? { headers: bridge.auth.headers } : {}),
    ...(bridge.auth.baseUrl ? { baseUrl: bridge.auth.baseUrl } : {}),
  });
  delete process.env.PINOT_CREDENTIAL_BRIDGE;
  delete process.env.PINOT_WORKER_ROOT;
  return bridge;
}

interface WorkerPathContext { root: string; rootReal: string; }
let workerPath: WorkerPathContext | undefined;

export async function initializeWorkerRoot(root: string): Promise<void> {
  const rootReal = await realpath(root);
  workerPath = { root: rootReal, rootReal };
}

export async function resolveWorkerReadPath(input: string | undefined, allowRoot = true): Promise<string> {
  if (!workerPath) throw new Error("worker read boundary unavailable");
  const requested = input && input.trim() ? input : ".";
  const candidate = isAbsolute(requested) ? resolve(requested) : resolve(workerPath.rootReal, requested);
  const canonical = await realpath(candidate);
  const rel = relative(workerPath.rootReal, canonical);
  if ((!allowRoot && !rel) || rel.startsWith("..") || isAbsolute(rel)) throw new Error("worker read path is outside the canonical project root");
  return canonical;
}

function result(text: string, details: Record<string, unknown> = {}) {
  const bounded = boundedResultText(text);
  return { content: [{ type: "text" as const, text: bounded }], details };
}

const readSchema = Type.Object({ path: Type.String(), offset: Type.Optional(Type.Number()), limit: Type.Optional(Type.Number()) });
const grepSchema = Type.Object({ pattern: Type.String(), path: Type.Optional(Type.String()), glob: Type.Optional(Type.String()), ignoreCase: Type.Optional(Type.Boolean()), literal: Type.Optional(Type.Boolean()), context: Type.Optional(Type.Number()), limit: Type.Optional(Type.Number()) });
const findSchema = Type.Object({ pattern: Type.String(), path: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) });
const lsSchema = Type.Object({ path: Type.Optional(Type.String()), limit: Type.Optional(Type.Number()) });

async function registerReadTools(pi: ExtensionAPI): Promise<void> {
  pi.registerTool({
    name: "read", label: "Read", description: `Read text within the canonical worker root; output is bounded to ${MAX_OUTPUT_BYTES} bytes or ${MAX_OUTPUT_LINES} lines.`, parameters: readSchema,
    async execute(_id, params) {
      const file = await resolveWorkerReadPath(params.path, false);
      const text = await readFile(file, "utf8");
      const lines = text.split("\n");
      const start = Math.max(0, Math.floor(params.offset ?? 1) - 1);
      const selected = lines.slice(start, params.limit === undefined ? start + MAX_OUTPUT_LINES : start + Math.max(0, Math.floor(params.limit)));
      return result(selected.join("\n"));
    },
  });
  pi.registerTool({
    name: "ls", label: "List", description: "List entries within the canonical worker root.", parameters: lsSchema,
    async execute(_id, params) {
      const directory = await resolveWorkerReadPath(params.path);
      const entries = await (await import("node:fs/promises")).readdir(directory);
      return result(entries.slice(0, Math.min(params.limit ?? 500, MAX_OUTPUT_LINES)).join("\n"));
    },
  });
  pi.registerTool({
    name: "grep", label: "Grep", description: "Search text within the canonical worker root.", parameters: grepSchema,
    async execute(_id, params) {
      const target = await resolveWorkerReadPath(params.path);
      const stat = await (await import("node:fs/promises")).stat(target);
      const files = stat.isDirectory() ? await collectFiles(target, workerPath!.rootReal) : [target];
      const expression = params.literal ? undefined : new RegExp(params.pattern, params.ignoreCase ? "i" : "");
      const needle = params.ignoreCase ? params.pattern.toLowerCase() : params.pattern;
      const matches: string[] = [];
      for (const file of files) {
        if (params.glob && !basename(file).includes(params.glob.replaceAll("*", ""))) continue;
        const fileLines = (await readFile(file, "utf8")).split("\n");
        fileLines.forEach((line, index) => {
          const found = expression ? expression.test(line) : (params.ignoreCase ? line.toLowerCase().includes(needle) : line.includes(needle));
          if (found && matches.length < (params.limit ?? 100)) matches.push(`${relative(workerPath!.rootReal, file)}:${index + 1}:${line}`);
        });
      }
      return result(matches.join("\n"));
    },
  });
  pi.registerTool({
    name: "find", label: "Find", description: "Find files within the canonical worker root.", parameters: findSchema,
    async execute(_id, params) {
      const directory = await resolveWorkerReadPath(params.path);
      const files = await collectFiles(directory, workerPath!.rootReal);
      const needle = params.pattern.replaceAll("*", "");
      return result(files.filter((file) => basename(file).includes(needle)).slice(0, params.limit ?? 1000).map((file) => relative(workerPath!.rootReal, file)).join("\n"));
    },
  });
}

async function collectFiles(directory: string, root: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await (await import("node:fs/promises")).readdir(directory, { withFileTypes: true })) {
    const candidate = join(directory, entry.name);
    const canonical = await realpath(candidate);
    const rel = relative(root, canonical);
    if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("worker read path is outside the canonical project root");
    if (entry.isDirectory()) output.push(...await collectFiles(canonical, root));
    else if (entry.isFile()) output.push(canonical);
  }
  return output;
}

export default async function childBootstrap(pi: ExtensionAPI): Promise<void> {
  const bridgePath = process.env.PINOT_CREDENTIAL_BRIDGE;
  const root = process.env.PINOT_WORKER_ROOT;
  if (!bridgePath || !root) throw new Error("Pinot child bootstrap is missing its private handoff");
  const bridge = await consumeCredentialBridge(bridgePath, pi);
  if (bridge.root !== root) throw new Error("Pinot child bootstrap root mismatch");
  await initializeWorkerRoot(root);
  await registerReadTools(pi);
}
