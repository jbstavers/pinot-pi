import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const STATE_ROOT_ENV = "PINOT_STATE_DIR";

export interface StatePaths {
  root: string;
  config: string;
  implementationHistory: string;
  implementationRoot: string;
  implementationSessions: string;
  implementationCheckpoints: string;
}

export interface PiLocations {
  agentDirectory: string;
  sessionDirectory: string;
  currentSessionFile?: string;
}

export function resolveStateRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[STATE_ROOT_ENV];
  if (override !== undefined) {
    if (!override.trim()) throw new Error(`${STATE_ROOT_ENV} must be an absolute directory path when set.`);
    if (!isAbsolute(override)) throw new Error(`${STATE_ROOT_ENV} must be an absolute directory path.`);
    return resolve(override);
  }
  return join(env.HOME || homedir(), ".pinot-pi");
}

export function resolveStatePaths(env: NodeJS.ProcessEnv = process.env): StatePaths {
  const root = resolveStateRoot(env);
  const implementationHistory = join(root, "implementation-history");
  const implementationRoot = join(root, "implementer");
  return {
    root,
    config: join(root, "config.json"),
    implementationHistory,
    implementationRoot,
    implementationSessions: join(implementationRoot, "sessions"),
    implementationCheckpoints: join(implementationRoot, "checkpoints"),
  };
}

export function resolvePiLocations(
  agentDirectory: string,
  env: NodeJS.ProcessEnv = process.env,
  currentSessionFile?: string,
): PiLocations {
  const sessionDirectory = env.PI_CODING_AGENT_SESSION_DIR ||
    (currentSessionFile ? dirname(currentSessionFile) : join(agentDirectory, "sessions"));
  return { agentDirectory, sessionDirectory, ...(currentSessionFile ? { currentSessionFile } : {}) };
}
