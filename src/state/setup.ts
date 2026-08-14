import { chmod, lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { StatePaths } from "./paths.ts";
import { parsePinotConfig, serializePinotConfig } from "../config/types.ts";

export interface SetupTemplates {
  config: string;
  historyIndex: string;
  historyRecord: string;
}

export interface SetupResult {
  paths: StatePaths;
  created: string[];
}

export interface StateInspection {
  path: string;
  kind: "missing" | "directory" | "file" | "symlink" | "other" | "unsafe";
  detail?: string;
}

export interface StateStatus {
  paths: StatePaths;
  entries: StateInspection[];
  config: "missing" | "valid" | "invalid" | "unsafe";
}

const TEMPLATE_FILES = {
  config: "pinot-config.json",
  historyIndex: "implementation-history/index.md",
  historyRecord: "implementation-history/record-template.md",
} as const;

export async function loadPackageTemplates(): Promise<SetupTemplates> {
  const root = fileURLToPath(new URL("../../templates/", import.meta.url));
  const [config, historyIndex, historyRecord] = await Promise.all(
    Object.values(TEMPLATE_FILES).map((relative) => readFile(join(root, relative), "utf8")),
  );
  return { config, historyIndex, historyRecord };
}

export async function setupState(paths: StatePaths, templates: SetupTemplates = {
  config: serializePinotConfig(),
  historyIndex: "# Implementation history\n",
  historyRecord: "# Implementation record\n",
}): Promise<SetupResult> {
  await preflightState(paths);
  const created: string[] = [];
  await ensureRoot(paths.root, created);
  await ensureDirectory(paths.implementationHistory, "implementation-history", created);
  await ensureDirectory(paths.implementationRoot, "implementer", created);
  await ensureDirectory(paths.implementationSessions, "implementer/sessions", created);
  await ensureDirectory(paths.implementationCheckpoints, "implementer/checkpoints", created);
  await ensureFile(paths.config, templates.config, "config.json", created, true);
  await ensureFile(join(paths.implementationHistory, "index.md"), templates.historyIndex, "implementation-history/index.md", created, false);
  await ensureFile(join(paths.implementationHistory, "record-template.md"), templates.historyRecord, "implementation-history/record-template.md", created, false);
  return { paths, created };
}

export async function inspectState(paths: StatePaths): Promise<StateStatus> {
  const pathsToInspect = [
    [paths.root, "root"],
    [paths.config, "config"],
    [paths.implementationHistory, "implementation-history"],
    [paths.implementationRoot, "implementer"],
    [paths.implementationSessions, "implementer/sessions"],
    [paths.implementationCheckpoints, "implementer/checkpoints"],
  ] as const;
  const entries = await Promise.all(pathsToInspect.map(([path, label]) => inspectPath(path, label)));
  let config: StateStatus["config"] = "missing";
  const configEntry = entries[1];
  if (configEntry.kind === "file") {
    try {
      parsePinotConfig(await readFile(paths.config, "utf8"));
      config = "valid";
    } catch {
      config = "invalid";
    }
  } else if (configEntry.kind === "unsafe" || configEntry.kind === "symlink" || configEntry.kind === "other") {
    config = "unsafe";
  }
  return { paths, entries, config };
}

async function ensureRoot(path: string, created: string[]): Promise<void> {
  let existed = true;
  try {
    await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`Cannot inspect state root ${path}: ${error instanceof Error ? error.message : String(error)}`);
    existed = false;
  }
  try {
    await mkdir(path, { recursive: true, mode: 0o700 });
  } catch (error) {
    throw new Error(`Cannot create Pinot state root ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  await ensureDirectory(path, "state root", created);
  if (!existed) created.unshift(path);
}

async function preflightState(paths: StatePaths): Promise<void> {
  await preflightDirectory(paths.root, "state root");
  await preflightDirectory(paths.implementationHistory, "implementation-history");
  await preflightDirectory(paths.implementationRoot, "implementer");
  await preflightDirectory(paths.implementationSessions, "implementer/sessions");
  await preflightDirectory(paths.implementationCheckpoints, "implementer/checkpoints");
  await preflightFile(paths.config, "config.json");
  await preflightFile(join(paths.implementationHistory, "index.md"), "implementation-history/index.md");
  await preflightFile(join(paths.implementationHistory, "record-template.md"), "implementation-history/record-template.md");
}

async function preflightDirectory(path: string, label: string): Promise<void> {
  const info = await maybeLstat(path);
  if (!info) return;
  if (info.isSymbolicLink()) throw new Error(`Refusing symlink ${label}: ${path}`);
  if (!info.isDirectory()) throw new Error(`Refusing non-directory ${label}: ${path}`);
  assertOwnerSafe(info, path, label, 0o700);
}

async function preflightFile(path: string, label: string): Promise<void> {
  const info = await maybeLstat(path);
  if (!info) return;
  if (info.isSymbolicLink()) throw new Error(`Refusing symlink ${label}: ${path}`);
  if (!info.isFile()) throw new Error(`Refusing conflicting non-file ${label}: ${path}`);
  assertOwnerSafe(info, path, label, 0o600);
}

async function maybeLstat(path: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try { return await lstat(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(`Cannot inspect setup path ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function ensureDirectory(path: string, label: string, created: string[]): Promise<void> {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`Cannot inspect ${label} ${path}: ${error instanceof Error ? error.message : String(error)}`);
    await mkdir(path, { mode: 0o700 });
    await chmod(path, 0o700);
    created.push(path);
    info = await lstat(path);
  }
  if (info.isSymbolicLink()) throw new Error(`Refusing symlink ${label}: ${path}`);
  if (!info.isDirectory()) throw new Error(`Refusing non-directory ${label}: ${path}`);
  assertOwnerSafe(info, path, label, 0o700);
}

async function ensureFile(path: string, content: string, label: string, created: string[], writable: boolean): Promise<void> {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error(`Cannot inspect ${label} ${path}: ${error instanceof Error ? error.message : String(error)}`);
    try {
      await writeFile(path, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await chmod(path, 0o600);
      created.push(path);
      return;
    } catch (writeError) {
      if ((writeError as NodeJS.ErrnoException).code !== "EEXIST") throw new Error(`Cannot create ${label} ${path}: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
      info = await lstat(path);
    }
  }
  if (info.isSymbolicLink()) throw new Error(`Refusing symlink ${label}: ${path}`);
  if (!info.isFile()) throw new Error(`Refusing conflicting non-file ${label}: ${path}`);
  assertOwnerSafe(info, path, label, 0o600);
}

async function inspectPath(path: string, label: string): Promise<StateInspection> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) return { path, kind: "symlink", detail: `${label} is a symlink` };
    if (info.isDirectory()) {
      try { assertOwnerSafe(info, path, label); return { path, kind: "directory" }; }
      catch (error) { return { path, kind: "unsafe", detail: error instanceof Error ? error.message : String(error) }; }
    }
    if (info.isFile()) {
      try { assertOwnerSafe(info, path, label); return { path, kind: "file" }; }
      catch (error) { return { path, kind: "unsafe", detail: error instanceof Error ? error.message : String(error) }; }
    }
    return { path, kind: "other", detail: `${label} is not a regular file or directory` };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { path, kind: "missing" };
    return { path, kind: "unsafe", detail: `Cannot inspect ${label}: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function assertOwnerSafe(info: { uid?: number | bigint; mode: number | bigint }, path: string, label: string, expectedMode?: number): void {
  const currentUid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (currentUid !== undefined && info.uid !== undefined && Number(info.uid) !== currentUid) throw new Error(`Refusing ${label} not owned by the current user: ${path}`);
  const mode = Number(info.mode) & 0o7777;
  if ((mode & 0o077) !== 0 || (mode & 0o7000) !== 0) throw new Error(`Refusing ${label} with group/world or special permissions: ${path}`);
  if (expectedMode !== undefined && mode !== expectedMode) throw new Error(`Refusing ${label} with unsafe mode (expected ${expectedMode.toString(8)}): ${path}`);
}
