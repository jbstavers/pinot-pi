import { access, appendFile, chmod, lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { getModel } from "@earendil-works/pi-ai/compat";
import { describe, expect, it } from "vitest";
import { EMPTY_PINOT_CONFIG, serializePinotConfig } from "../src/config/types.ts";
import {
  agentSessionReference,
  contextMeasurementForUsage,
  recoverImplementerProfileFromJsonl,
  recoverSelectedModelFromJsonl,
  resolveDurableSession,
  runImplementer,
} from "../src/implementation/lifecycle.ts";
import {
  guardCyclesFromJsonl,
  summarizeGuard,
  usageTokens,
} from "../src/implementation/guard.ts";
import { setupState } from "../src/state/setup.ts";
import { resolveStatePaths } from "../src/state/paths.ts";
import { MAX_OUTPUT_BYTES, MAX_OUTPUT_LINES } from "../src/delegation/limits.ts";
import { runTestSuite, tokenizeExactCommand } from "../src/implementation/test-suite.ts";

const execFile = promisify(execFileCallback);
const projectCwd = () => mkdtemp(join(tmpdir(), "pinot-implementation-project-"));

async function gitProjectCwd(): Promise<string> {
  const cwd = await projectCwd();
  await execFile("git", ["-C", cwd, "init", "--quiet"]);
  await writeFile(join(cwd, ".gitignore"), "+*\n", { mode: 0o600 });
  return cwd;
}

function modelRegistry(auth: unknown = { auth: { apiKey: "SYNTHETIC_API_KEY" } }) {
  const model = getModel("openai", "o3-mini");
  return {
    find: () => model,
    getProviderAuth: async () => auth,
    getRegisteredProviderConfig: () => undefined,
    getRegisteredNativeProvider: () => undefined,
  } as any;
}

function herdrFixture(cwd: string, paneId: string, agents: unknown[] = []): any {
  return async (_command: string, args: string[]) => {
    const key = args.join(" ");
    if (key === "agent list") return { code: 0, stdout: JSON.stringify({ result: { agents } }), stderr: "" };
    if (key === "--version") return { code: 0, stdout: "herdr 0.7.5\n", stderr: "" };
    if (key === "status server") return { code: 0, stdout: "running\n", stderr: "" };
    if (key === "integration status") return { code: 0, stdout: "pi: current (v6)\n", stderr: "" };
    if (key === "pane current --current") return {
      code: 0,
      stdout: JSON.stringify({ result: { pane: { pane_id: paneId, agent: "pi", cwd, foreground_cwd: cwd } } }),
      stderr: "",
    };
    throw new Error(`unexpected synthetic Herdr command: ${key}`);
  };
}

async function withEnvironment<T>(values: Record<string, string | undefined>, action: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { return await action(); }
  finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("durable implementer helpers", () => {
  it("parses strict Herdr session references and recovers immutable model metadata", () => {
    expect(agentSessionReference({ agent_session: { value: "/synthetic/session.jsonl" } })).toEqual({ path: "/synthetic/session.jsonl" });
    expect(agentSessionReference({ agent_session_id: "synthetic-session" })).toEqual({ id: "synthetic-session" });
    expect(agentSessionReference({ agent_session: "synthetic-session" })).toEqual({ id: "synthetic-session" });
    expect(agentSessionReference({ agent_session: "" })).toEqual({});
    const jsonl = [
      JSON.stringify({ type: "session", id: "synthetic", provider: "openai", modelId: "o3-mini", thinkingLevel: "low" }),
      JSON.stringify({ type: "thinking_level_change", thinkingLevel: "high" }),
      JSON.stringify({ type: "message", message: { role: "assistant", provider: "openai", model: "o3-mini" } }),
    ].join("\n");
    expect(recoverSelectedModelFromJsonl(jsonl)).toEqual({ spec: "openai/o3-mini:high", provider: "openai", model: "o3-mini", thinking: "high" });
    expect(recoverImplementerProfileFromJsonl(jsonl)).toBeUndefined();
    const janitorProfile = JSON.stringify({ type: "custom", customType: "pinot-implementer-profile", data: { version: 1, profile: "janitor" } });
    expect(recoverImplementerProfileFromJsonl(`${jsonl}\n${janitorProfile}`)).toBe("janitor");
    expect(() => recoverImplementerProfileFromJsonl(`${janitorProfile}\n${janitorProfile.replace('"janitor"', '"implementation"')}`)).toThrow(/conflicts/);
    expect(() => recoverImplementerProfileFromJsonl(JSON.stringify({ type: "custom", customType: "pinot-implementer-profile", data: { version: 2, profile: "janitor" } }))).toThrow(/invalid/);
  });

  it("refuses ambiguous durable session files instead of guessing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pinot-session-files-"));
    const header = (id: string) => `${JSON.stringify({ type: "session", id, cwd: directory, provider: "openai", modelId: "o3-mini", thinkingLevel: "low" })}\n`;
    await writeFile(join(directory, "one.jsonl"), header("implementer"));
    expect((await resolveDurableSession(directory, "implementer"))?.legacy).toBe(false);
    await writeFile(join(directory, "two.jsonl"), header("other"));
    await expect(resolveDurableSession(directory, "missing")).rejects.toThrow(/multiple unmatched/);
    await writeFile(join(directory, "three.jsonl"), header("implementer"));
    await expect(resolveDurableSession(directory, "implementer")).rejects.toThrow(/duplicate/);
  });

  it("keeps context and guard details free of session paths", () => {
    const cycle = {
      version: 1,
      cycleId: "cycle-1",
      trigger: "manual",
      state: "failed",
      timestamp: "2026-01-01T00:00:00.000Z",
      startedAt: "2026-01-01T00:00:00.000Z",
      preCompactUsage: { tokens: 1, contextWindow: 2, percent: 50 },
      error: "/synthetic/private/path",
    };
    const cycles = guardCyclesFromJsonl(JSON.stringify({ type: "custom", customType: "pinot-implementer-context-guard", data: cycle }));
    expect(summarizeGuard(cycles).outcome).toBe("failed");
    expect(usageTokens({ input: 2, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 5 })).toBeGreaterThan(0);
    expect(contextMeasurementForUsage({ tokens: 80, contextWindow: 100 })).toEqual({ tokens: 80, contextWindow: 100, percent: 80, status: "known", atOrAboveCap: true });
    expect(JSON.stringify(contextMeasurementForUsage({ tokens: 80, contextWindow: 100 }))).not.toContain("sessionPath");
  });
});

describe("durable implementer preflight and public handoff", () => {
  it("refuses clearly without Herdr instead of falling back to root editing", async () => {
    const home = await mkdtemp(join(tmpdir(), "pinot-implementation-home-"));
    const cwd = await projectCwd();
    const paths = resolveStatePaths({ HOME: home });
    await setupState(paths);
    await writeFile(paths.config, serializePinotConfig({ ...EMPTY_PINOT_CONFIG, implementerEffort: { standard: "openai/o3-mini:low", maximum: "openai/o3-mini:low" } }), { mode: 0o600 });
    await withEnvironment({ PINOT_STATE_DIR: paths.root, HERDR_ENV: undefined, HERDR_SOCKET_PATH: undefined, HERDR_PANE_ID: undefined }, async () => {
      await expect(runImplementer({ action: "start", name: "no-herdr", cwd, assignment: "Write the bounded synthetic assignment." } as any, cwd, {
        modelRegistry: modelRegistry(),
        exec: async () => { throw new Error("must not invoke Herdr when the environment is absent"); },
      })).rejects.toThrow(/active Herdr environment|HERDR_ENV=1|main-agent editing/i);
    });
  });

  it("rejects unavailable authentication before any pane is created", async () => {
    const home = await mkdtemp(join(tmpdir(), "pinot-implementation-home-"));
    const cwd = await projectCwd();
    const paths = resolveStatePaths({ HOME: home });
    await setupState(paths);
    await writeFile(paths.config, serializePinotConfig({ ...EMPTY_PINOT_CONFIG, implementerEffort: { standard: "openai/o3-mini:low", maximum: "openai/o3-mini:low" } }), { mode: 0o600 });
    const calls: string[][] = [];
    await withEnvironment({ PINOT_STATE_DIR: paths.root, HERDR_ENV: "1", HERDR_SOCKET_PATH: "/synthetic/herdr.sock", HERDR_PANE_ID: "parent" }, async () => {
      await expect(runImplementer({ action: "start", name: "auth-check", cwd, assignment: "Write the bounded synthetic assignment." } as any, cwd, {
        modelRegistry: modelRegistry(null),
        exec: async (_command, args) => { calls.push(args); return herdrFixture(cwd, "parent")(_command, args); },
      })).rejects.toThrow(/authentication/i);
    });
    expect(calls.some((args) => args[0] === "pane" && args[1] === "split")).toBe(false);
  });

  it("checks the active parent topology immediately before pane creation", async () => {
    const home = await mkdtemp(join(tmpdir(), "pinot-implementation-home-"));
    const cwd = await projectCwd();
    const paths = resolveStatePaths({ HOME: home });
    await setupState(paths);
    await writeFile(paths.config, serializePinotConfig({ ...EMPTY_PINOT_CONFIG, implementerEffort: { standard: "openai/o3-mini:low", maximum: "openai/o3-mini:low" } }), { mode: 0o600 });
    const calls: string[][] = [];
    let authCalls = 0;
    const fixture = herdrFixture(cwd, "different-parent");
    await withEnvironment({ PINOT_STATE_DIR: paths.root, HERDR_ENV: "1", HERDR_SOCKET_PATH: "/synthetic/herdr.sock", HERDR_PANE_ID: "parent" }, async () => {
      await expect(runImplementer({ action: "start", name: "topology-check", cwd, assignment: "Write the bounded synthetic assignment." } as any, cwd, {
        modelRegistry: { ...modelRegistry(), getProviderAuth: async () => { authCalls += 1; return { auth: { apiKey: "SYNTHETIC_API_KEY" } }; } } as any,
        exec: async (_command, args) => { calls.push(args); return fixture(_command, args); },
      })).rejects.toThrow(/parent pane|active Pi parent/i);
    });
    expect(authCalls).toBe(0);
    expect(calls.some((args) => args[0] === "agent" && args[1] === "list")).toBe(false);
    expect(calls.some((args) => args[0] === "pane" && args[1] === "split")).toBe(false);
  });

  it("preflights resume before querying live hosts or resolving auth", async () => {
    const home = await mkdtemp(join(tmpdir(), "pinot-implementation-home-"));
    const cwd = await projectCwd();
    const paths = resolveStatePaths({ HOME: home });
    await setupState(paths);
    const sessionDirectory = join(paths.implementationSessions, "resume-topology");
    await mkdir(sessionDirectory, { mode: 0o700 });
    await writeFile(join(sessionDirectory, "child.jsonl"), `${JSON.stringify({ type: "session", id: "resume-topology", cwd, provider: "openai", modelId: "o3-mini", thinkingLevel: "low" })}\n${JSON.stringify({ type: "custom", customType: "pinot-implementer-profile", data: { version: 1, profile: "implementation" } })}\n`, { mode: 0o600 });
    const calls: string[][] = [];
    let authCalls = 0;
    const fixture = herdrFixture(cwd, "different-parent");
    await withEnvironment({ PINOT_STATE_DIR: paths.root, HERDR_ENV: "1", HERDR_SOCKET_PATH: "/synthetic/herdr.sock", HERDR_PANE_ID: "parent" }, async () => {
      await expect(runImplementer({ action: "resume", name: "resume-topology", cwd, assignment: "Resume the bounded synthetic assignment." } as any, cwd, {
        modelRegistry: { ...modelRegistry(), getProviderAuth: async () => { authCalls += 1; return { auth: { apiKey: "SYNTHETIC_API_KEY" } }; } } as any,
        exec: async (_command, args) => { calls.push(args); return fixture(_command, args); },
      })).rejects.toThrow(/parent pane|active Pi parent/i);
    });
    expect(authCalls).toBe(0);
    expect(calls.some((args) => args[0] === "agent" && args[1] === "list")).toBe(false);
    expect(calls.some((args) => args[0] === "pane" && args[1] === "split")).toBe(false);
  });

  it("delivers a checkpoint without exposing its private path or credential-shaped text", async () => {
    const home = await mkdtemp(join(tmpdir(), "pinot-implementation-home-"));
    const cwd = await projectCwd();
    const paths = resolveStatePaths({ HOME: home });
    await setupState(paths);
    const sessionDirectory = join(paths.implementationSessions, "delivery-check");
    await (await import("node:fs/promises")).mkdir(sessionDirectory, { mode: 0o700 });
    await writeFile(join(sessionDirectory, "child.jsonl"), `${JSON.stringify({ type: "session", id: "delivery-check", cwd, provider: "openai", modelId: "o3-mini", thinkingLevel: "low" })}\n${JSON.stringify({ type: "custom", customType: "pinot-implementer-profile", data: { version: 1, profile: "implementation" } })}\n`, { mode: 0o600 });
    const checkpointPath = join(paths.implementationCheckpoints, "delivery-check.md");
    await writeFile(checkpointPath, `Changed files\nPath: ${checkpointPath}\napiKey=SYNTHETIC_SECRET\nAuthorization: Bearer SYNTHETIC_AUTH_SECRET\nBearer SYNTHETIC_BEARER_SECRET\ntoken=SYNTHETIC_TOKEN_SECRET\n`, { mode: 0o600 });
    const fixture = herdrFixture(cwd, "parent");
    const result = await withEnvironment({ PINOT_STATE_DIR: paths.root, HERDR_ENV: "1", HERDR_SOCKET_PATH: "/synthetic/herdr.sock", HERDR_PANE_ID: "parent" }, async () => runImplementer({ action: "wait", name: "delivery-check", cwd } as any, cwd, {
      modelRegistry: modelRegistry(),
      exec: fixture,
    }).then((value) => value));
    expect(result.content).toContain("Checkpoint-v4:");
    expect(result.content).toContain("Changed files");
    expect(result.content).not.toContain(checkpointPath);
    expect(result.content).not.toContain("SYNTHETIC_SECRET");
    expect(result.content).not.toContain("SYNTHETIC_AUTH_SECRET");
    expect(result.content).not.toContain("SYNTHETIC_BEARER_SECRET");
    expect(result.content).not.toContain("SYNTHETIC_TOKEN_SECRET");
    expect(JSON.stringify(result.details)).not.toContain("Changed files");
    expect(JSON.stringify(result.details)).not.toContain(checkpointPath);
    expect(JSON.stringify(result.details)).not.toContain("SYNTHETIC_SECRET");
    expect(JSON.stringify(result.details)).not.toContain("SYNTHETIC_AUTH_SECRET");
    expect(JSON.stringify(result.details)).not.toContain("SYNTHETIC_BEARER_SECRET");
    expect(JSON.stringify(result.details)).not.toContain("SYNTHETIC_TOKEN_SECRET");
    expect(result.details.childSession).toEqual({ id: "delivery-check", legacy: false });
    expect(result.details.context).not.toHaveProperty("sessionPath");
  });

  it("bounds semantic checkpoint results by UTF-8 bytes and lines", async () => {
    const home = await mkdtemp(join(tmpdir(), "pinot-implementation-home-"));
    const cwd = await projectCwd();
    const paths = resolveStatePaths({ HOME: home });
    await setupState(paths);
    const sessionDirectory = join(paths.implementationSessions, "result-bounds");
    await mkdir(sessionDirectory, { mode: 0o700 });
    await writeFile(join(sessionDirectory, "child.jsonl"), `${JSON.stringify({ type: "session", id: "result-bounds", cwd, provider: "openai", modelId: "o3-mini", thinkingLevel: "low" })}\n${JSON.stringify({ type: "custom", customType: "pinot-implementer-profile", data: { version: 1, profile: "implementation" } })}\n`, { mode: 0o600 });
    const checkpointPath = join(paths.implementationCheckpoints, "result-bounds.md");
    const fixture = herdrFixture(cwd, "parent");
    const run = (value: string) => writeFile(checkpointPath, value, { mode: 0o600 }).then(() => withEnvironment({ PINOT_STATE_DIR: paths.root, HERDR_ENV: "1", HERDR_SOCKET_PATH: "/synthetic/herdr.sock", HERDR_PANE_ID: "parent" }, () => runImplementer({ action: "wait", name: "result-bounds", cwd } as any, cwd, { modelRegistry: modelRegistry(), exec: fixture })));

    const lineResult = await run(Array.from({ length: MAX_OUTPUT_LINES + 500 }, (_, index) => `é-line-${index}`).join("\n"));
    expect(Buffer.byteLength(lineResult.content, "utf8")).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
    expect(lineResult.content.split("\n").length).toBeLessThanOrEqual(MAX_OUTPUT_LINES);
    expect(lineResult.content).toContain("[Output truncated at 50KB/2000 lines.]");
    expect(JSON.stringify(lineResult.details)).not.toContain("é-line-");

    const byteResult = await run(Array.from({ length: 600 }, () => "é".repeat(200)).join("\n"));
    expect(Buffer.byteLength(byteResult.content, "utf8")).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
    expect(byteResult.content.split("\n").length).toBeLessThanOrEqual(MAX_OUTPUT_LINES);
    expect(byteResult.content).toContain("[Checkpoint output truncated.]");
  });
});

describe("synthetic Herdr implementer lifecycle", () => {
  it("covers duplicate refusal, pane cleanup, still-working wait, fresh delivery, compact, close, and resume", async () => {
    const home = await mkdtemp(join(tmpdir(), "pinot-implementation-home-"));
    const cwd = await projectCwd();
    const paths = resolveStatePaths({ HOME: home });
    await setupState(paths);
    await writeFile(paths.config, serializePinotConfig({
      ...EMPTY_PINOT_CONFIG,
      implementerEffort: { standard: "openai/o3-mini:low", maximum: "openai/o3-mini:low" },
    }), { mode: 0o600 });

    type SyntheticAgent = Record<string, unknown>;
    const agents = new Map<string, SyntheticAgent>();
    const panes = new Set<string>();
    const closedPanes: string[] = [];
    const cleanupFailurePanes = new Set<string>();
    const stillWorkingOnce = new Set<string>();
    const suppressCheckpoint = new Set<string>();
    const waitCounts = new Map<string, number>();
    const profileByPane = new Map<string, "implementation" | "janitor">();
    const agentStartArguments = new Map<string, string[]>();
    const agentStartFailures = new Set(["agent-start-failure", "agent-start-cleanup-failure"]);
    const invalidAgentStarts = new Set(["agent-start-invalid"]);
    let paneNumber = 0;
    let lifecycleStarted = false;
    let accelerateGuardTimeout = false;
    let clock = Date.now();
    const now = () => clock;
    const pause = async (milliseconds: number) => { clock += accelerateGuardTimeout ? 600_001 : milliseconds; };

    const sessionPathFor = (name: string) => join(paths.implementationSessions, name, `${name}.jsonl`);
    const checkpointPathFor = (name: string) => join(paths.implementationCheckpoints, `${name}.md`);
    const writeSyntheticCheckpoint = async (name: string) => {
      await writeFile(checkpointPathFor(name), `checkpoint-v4\nstate: completed\nname: ${name}\n`, { encoding: "utf8", mode: 0o600 });
    };
    const appendSyntheticGuard = async (name: string, cycleId: string, state: "started" | "completed") => {
      const timestamp = new Date().toISOString();
      await appendFile(sessionPathFor(name), `${JSON.stringify({
        type: "custom",
        customType: "pinot-implementer-context-guard",
        data: {
          version: 1,
          cycleId,
          trigger: "manual",
          state,
          timestamp,
          startedAt: timestamp,
          ...(state === "completed" ? { completedAt: timestamp } : {}),
          preCompactUsage: { tokens: 1, contextWindow: 10, percent: 10 },
        },
      })}\n`);
    };
    const ensureSyntheticSession = async (name: string, directory: string, profile: "implementation" | "janitor" = "implementation", id = name) => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const path = join(directory, `${name}.jsonl`);
      try {
        await writeFile(path, `${JSON.stringify({ type: "session", id, cwd, provider: "openai", modelId: "o3-mini", thinkingLevel: "low" })}\n${JSON.stringify({ type: "custom", customType: "pinot-implementer-profile", data: { version: 1, profile } })}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      return path;
    };

    const syntheticExec = async (_command: string, args: string[]) => {
      const key = args.join(" ");
      if (key === "--version") return { code: 0, stdout: "herdr 0.7.5\n", stderr: "" };
      if (key === "status server") return { code: 0, stdout: "running\n", stderr: "" };
      if (key === "integration status") return { code: 0, stdout: "pi: current (v6)\n", stderr: "" };
      if (key === "pane current --current") return {
        code: 0,
        stdout: JSON.stringify({ result: { pane: { pane_id: "parent", agent: "pi", cwd, foreground_cwd: cwd } } }),
        stderr: "",
      };
      if (args[0] === "pane" && args[1] === "split") {
        const paneId = `pane-${++paneNumber}`;
        panes.add(paneId);
        const profile = args.find((arg) => arg.startsWith("PINOT_IMPLEMENTER_PROFILE="))?.split("=", 2)[1];
        profileByPane.set(paneId, profile === "janitor" ? "janitor" : "implementation");
        return { code: 0, stdout: JSON.stringify({ result: { pane: { pane_id: paneId } } }), stderr: "" };
      }
      if (args[0] === "agent" && args[1] === "start") {
        const name = args[2];
        agentStartArguments.set(name, [...args]);
        const paneId = args[args.indexOf("--pane") + 1];
        if (name === "agent-start-cleanup-failure") cleanupFailurePanes.add(paneId);
        if (agentStartFailures.has(name)) return { code: 1, stdout: "", stderr: "synthetic agent start failure" };
        if (invalidAgentStarts.has(name)) {
          return { code: 0, stdout: JSON.stringify({ result: { agent: { name: "wrong-name", pane_id: paneId, cwd, agent_status: "idle" } } }), stderr: "" };
        }
        const sessionDirectory = args[args.indexOf("--session-dir") + 1];
        const path = await ensureSyntheticSession(name, sessionDirectory, profileByPane.get(paneId) ?? "implementation");
        agents.set(name, { name, pane_id: paneId, cwd, foreground_cwd: cwd, agent_status: "idle", agent_session_path: path });
        if (name === "lifecycle" && !lifecycleStarted) {
          lifecycleStarted = true;
          stillWorkingOnce.add(name);
        }
        return { code: 0, stdout: JSON.stringify({ result: { agent: agents.get(name) } }), stderr: "" };
      }
      if (args[0] === "agent" && args[1] === "prompt") {
        const name = args[2];
        const agent = agents.get(name);
        if (!agent) return { code: 1, stdout: "", stderr: "agent_not_found" };
        const prompt = args[3] ?? "";
        if (name === "cleanup") {
          agent.agent_status = "idle";
          return { code: 1, stdout: "", stderr: "synthetic prompt failure" };
        }
        agent.agent_status = "working";
        if (prompt === "/pinot-implementer-compact") {
          await appendSyntheticGuard(name, "compact-cycle", "completed");
          agent.agent_status = "idle";
        }
        return { code: 0, stdout: "{}", stderr: "" };
      }
      if (args[0] === "agent" && args[1] === "wait") {
        const name = args[2];
        const agent = agents.get(name);
        if (!agent) return { code: 1, stdout: "", stderr: "agent_not_found" };
        const count = (waitCounts.get(name) ?? 0) + 1;
        waitCounts.set(name, count);
        if (stillWorkingOnce.delete(name)) return { code: 0, stdout: "", stderr: "" };
        agent.agent_status = "idle";
        if (!suppressCheckpoint.has(name)) await writeSyntheticCheckpoint(name);
        return { code: 0, stdout: "", stderr: "" };
      }
      if (args[0] === "agent" && args[1] === "get") {
        const target = args[2];
        const agent = [...agents.values()].find((candidate) => candidate.pane_id === target || candidate.name === target);
        if (!agent) return { code: 1, stdout: "", stderr: "agent_not_found" };
        return { code: 0, stdout: JSON.stringify({ result: { agent } }), stderr: "" };
      }
      if (args[0] === "agent" && args[1] === "list") {
        return { code: 0, stdout: JSON.stringify({ result: { agents: [...agents.values()] } }), stderr: "" };
      }
      if (args[0] === "pane" && args[1] === "close") {
        const paneId = args[2];
        if (cleanupFailurePanes.has(paneId)) return { code: 1, stdout: "", stderr: "synthetic pane close failure" };
        if (!panes.has(paneId)) return { code: 1, stdout: "", stderr: "pane_not_found" };
        panes.delete(paneId);
        const agent = [...agents.entries()].find(([, candidate]) => candidate.pane_id === paneId);
        if (agent) agents.delete(agent[0]);
        closedPanes.push(paneId);
        return { code: 0, stdout: "", stderr: "" };
      }
      return { code: 1, stdout: "", stderr: "unexpected synthetic Herdr command" };
    };

    const registry = modelRegistry();
    const run = (input: Record<string, unknown>) => runImplementer(input as any, cwd, {
      modelRegistry: registry,
      statePaths: paths,
      exec: syntheticExec as any,
      now,
      pause,
    });

    await withEnvironment({ PINOT_STATE_DIR: paths.root, HERDR_ENV: "1", HERDR_SOCKET_PATH: "/synthetic/herdr.sock", HERDR_PANE_ID: "parent" }, async () => {
      agents.set("duplicate", { name: "duplicate", pane_id: "duplicate-pane", cwd, agent_status: "idle" });
      await expect(run({ action: "start", name: "duplicate", assignment: "duplicate" })).rejects.toThrow(/already has a live host/);
      expect(paneNumber).toBe(0);
      agents.delete("duplicate");

      await expect(run({ action: "start", name: "cleanup", assignment: "cleanup" })).rejects.toThrow(/failed/);
      expect(closedPanes).toHaveLength(1);

      await expect(run({ action: "start", name: "agent-start-failure", assignment: "agent start failure" })).rejects.toThrow(/failed/);
      expect(closedPanes).toContain("pane-2");
      expect(panes.has("pane-2")).toBe(false);
      await expect(run({ action: "start", name: "agent-start-invalid", assignment: "invalid identity" })).rejects.toThrow(/failed/);
      expect(closedPanes).toContain("pane-3");
      expect(panes.has("pane-3")).toBe(false);
      await expect(run({ action: "start", name: "agent-start-cleanup-failure", assignment: "cleanup failure" })).rejects.toThrow(/cleanup failed/);
      expect(panes.has("pane-4")).toBe(true);
      cleanupFailurePanes.delete("pane-4");
      const cleanupResult = await syntheticExec("herdr", ["pane", "close", "pane-4"]);
      expect(cleanupResult.code).toBe(0);
      expect(panes.has("pane-4")).toBe(false);

      const started = await run({ action: "start", name: "lifecycle", assignment: "bounded synthetic assignment" });
      expect(started.content).toContain("still working");
      expect(started.content).not.toContain("Checkpoint-v4:");
      expect(started.details.host?.status).toBe("working");
      expect(started.details.profile).toBe("implementation");
      expect(agentStartArguments.get("lifecycle")).not.toContain("--skill");
      await expect(run({ action: "close", name: "lifecycle" })).rejects.toThrow(/still working/);

      const waited = await run({ action: "wait", name: "lifecycle" });
      expect(waited.details.checkpoint).toMatchObject({ present: true, fresh: null });
      expect(waited.content).toContain("Checkpoint-v4:");
      await appendSyntheticGuard("lifecycle", "pending-handoff", "started");
      accelerateGuardTimeout = true;
      await expect(run({ action: "wait", name: "lifecycle" })).rejects.toThrow(/guard markers did not settle/);
      accelerateGuardTimeout = false;
      clock = Date.now();
      await appendSyntheticGuard("lifecycle", "pending-handoff", "completed");

      const followedUp = await run({ action: "follow_up", name: "lifecycle", assignment: "follow-up synthetic assignment" });
      expect(followedUp.details.checkpoint).toMatchObject({ present: true, fresh: true });

      const compacted = await run({ action: "compact", name: "lifecycle" });
      expect(compacted.details.guard.outcome).toBe("completed");

      const checkpointPath = checkpointPathFor("lifecycle");
      await rm(checkpointPath, { force: true });
      await expect(run({ action: "close", name: "lifecycle" })).rejects.toThrow(/regular checkpoint/);
      expect([...agents.keys()]).toContain("lifecycle");
      await writeSyntheticCheckpoint("lifecycle");
      await appendSyntheticGuard("lifecycle", "close-pending", "started");
      await expect(run({ action: "close", name: "lifecycle" })).rejects.toThrow(/pending guard/);
      expect([...agents.keys()]).toContain("lifecycle");
      await appendSyntheticGuard("lifecycle", "close-pending", "completed");

      const closed = await run({ action: "close", name: "lifecycle" });
      expect(closed.details.host?.status).toBe("closed");
      expect(closed.details.childSession).toEqual({ id: "lifecycle", legacy: false });
      expect(closedPanes).toContain("pane-2");
      await expect(access(sessionPathFor("lifecycle"))).resolves.toBeUndefined();

      const resumed = await run({ action: "resume", name: "lifecycle", assignment: "resume synthetic assignment" });
      expect(resumed.details.host?.status).toBe("idle");
      expect(resumed.details.checkpoint).toMatchObject({ present: true, fresh: true });
      const closedAgain = await run({ action: "close", name: "lifecycle" });
      expect(closedAgain.details.host?.status).toBe("closed");

      const janitor = await run({ action: "start", name: "janitor", profile: "janitor", assignment: "bounded janitor assignment" });
      expect(janitor.details.profile).toBe("janitor");
      const initialJanitorArgs = [...(agentStartArguments.get("janitor") ?? [])];
      const janitorWaitsBeforeInvalidProfile = waitCounts.get("janitor") ?? 0;
      const janitorStartsBeforeInvalidProfile = agentStartArguments.size;
      await expect(run({ action: "wait", name: "janitor", profile: "janitor" })).rejects.toThrow(/profile is supported only for start/);
      expect(waitCounts.get("janitor") ?? 0).toBe(janitorWaitsBeforeInvalidProfile);
      expect(agentStartArguments.size).toBe(janitorStartsBeforeInvalidProfile);

      const janitorClosed = await run({ action: "close", name: "janitor" });
      const janitorResumed = await run({ action: "resume", name: "janitor", assignment: "resume bounded janitor assignment" });
      const janitorWaited = await run({ action: "wait", name: "janitor" });
      const janitorClosedAgain = await run({ action: "close", name: "janitor" });
      const janitorSkillPath = fileURLToPath(new URL("../skills/pinot-janitor/SKILL.md", import.meta.url));
      const resumedJanitorArgs = agentStartArguments.get("janitor") ?? [];
      for (const args of [initialJanitorArgs, resumedJanitorArgs]) {
        expect(args.filter((arg) => arg === "--no-skills")).toHaveLength(1);
        expect(args.filter((arg) => arg === "--skill")).toHaveLength(1);
        expect(args[args.indexOf("--skill") + 1]).toBe(janitorSkillPath);
      }
      const janitorResults = [janitor, janitorClosed, janitorResumed, janitorWaited, janitorClosedAgain];
      for (const result of janitorResults) expect(result.details.profile).toBe("janitor");
      const publicJanitorDetails = janitorResults.map((result) => JSON.stringify(result.details));
      for (const details of publicJanitorDetails) {
        expect(details).not.toContain("SKILL.md");
        expect(details).not.toContain("skills/pinot-janitor");
        expect(details).not.toContain("You are a specialist editing child");
      }

      const missingProfileDirectory = join(paths.implementationSessions, "missing-profile");
      await mkdir(missingProfileDirectory, { mode: 0o700 });
      await writeFile(join(missingProfileDirectory, "missing-profile.jsonl"), `${JSON.stringify({ type: "session", id: "missing-profile", cwd, provider: "openai", modelId: "o3-mini", thinkingLevel: "low" })}\n`, { mode: 0o600 });
      await expect(run({ action: "wait", name: "missing-profile" })).rejects.toThrow(/no immutable profile metadata/);
      expect(waitCounts.has("missing-profile")).toBe(false);

      const staleDirectory = join(paths.implementationSessions, "stale");
      await ensureSyntheticSession("stale", staleDirectory);
      agents.set("stale", { name: "stale", pane_id: "stale-pane", cwd, agent_status: "idle", agent_session_path: sessionPathFor("stale") });
      await writeSyntheticCheckpoint("stale");
      suppressCheckpoint.add("stale");
      await expect(run({ action: "follow_up", name: "stale", assignment: "stale checkpoint assignment" })).rejects.toThrow(/fresh checkpoint/);
    });
  });
});

describe("focused test-suite runner", () => {
  it("tokenizes literal arguments and rejects shell operators", () => {
    expect(tokenizeExactCommand(`node -e "process.stdout.write('ok')"`)).toEqual(["node", "-e", "process.stdout.write('ok')"]);
    expect(() => tokenizeExactCommand("echo ok; touch created")).toThrow(/shell syntax/);
    expect(() => tokenizeExactCommand("echo $(touch created)")).toThrow(/shell syntax/);
  });

  it("runs an exact command with an owner-only Git-ignored log root", async () => {
    const cwd = await gitProjectCwd();
    const result = await runTestSuite({ cwd, command: `node -e "process.stdout.write('synthetic pass')"`, timeoutMs: 5_000, label: "focused" });
    expect(result.details.status).toBe("pass");
    expect(result.details.passed).toBe(true);
    expect(result.details.logLocation).toMatch(/^\+test-output\//u);
    const logPath = join(cwd, "+test-output", result.details.logFile);
    expect((await stat(logPath)).mode & 0o7777).toBe(0o600);
    expect((await stat(join(cwd, "+test-output"))).mode & 0o7777).toBe(0o700);
    expect(await readFile(logPath, "utf8")).toContain("synthetic pass");
    expect(result.text).not.toContain(cwd);
  });

  it("rejects a nonignored project log root before creating it", async () => {
    const cwd = await gitProjectCwd();
    const unsafe = join(cwd, "ordinary-output");
    await expect(runTestSuite({ cwd, command: "node -e \"process.exit(0)\"", timeoutMs: 5_000, label: "unsafe", logRoot: unsafe })).rejects.toThrow(/Git-ignored/);
    await expect(access(unsafe)).rejects.toThrow();
  });

  it("accepts a Git-ignored project root even without a plus prefix", async () => {
    const cwd = await gitProjectCwd();
    await writeFile(join(cwd, ".gitignore"), "ignored-output/\n", { mode: 0o600 });
    const logRoot = join(cwd, "ignored-output");
    const result = await runTestSuite({ cwd, command: "node -e \"process.exit(0)\"", timeoutMs: 5_000, label: "ignored", logRoot });
    expect(result.details.status).toBe("pass");
    expect(result.details.logLocation).toMatch(/^ignored-output\//u);
  });

  it("rejects a project-local log root when cwd is not a Git repository", async () => {
    const cwd = await projectCwd();
    await expect(runTestSuite({ cwd, command: "node -e \"process.exit(0)\"", timeoutMs: 5_000, label: "nonrepo" })).rejects.toThrow(/Git-ignore|repository/i);
    await expect(access(join(cwd, "+test-output"))).rejects.toThrow();
  });

  it("allows an external Pinot-state log root and returns a logical location", async () => {
    const home = await mkdtemp(join(tmpdir(), "pinot-test-state-home-"));
    const cwd = await projectCwd();
    const paths = resolveStatePaths({ HOME: home });
    await setupState(paths);
    const result = await withEnvironment({ PINOT_STATE_DIR: paths.root }, () => runTestSuite({
      cwd,
      command: `node -e "process.stdout.write('state pass')"`,
      timeoutMs: 5_000,
      label: "state",
      logRoot: join(paths.root, "test-logs"),
    }));
    expect(result.details.logLocation).toMatch(/^pinot-state\/test-logs\//u);
    expect(result.details.logLocation).not.toContain(paths.root);
    expect(await readFile(join(paths.root, "test-logs", result.details.logFile), "utf8")).toContain("state pass");
  });

  it("rejects symlink log roots and keeps generated logs private", async () => {
    const cwd = await gitProjectCwd();
    const outside = await mkdtemp(join(tmpdir(), "pinot-test-output-outside-"));
    const linked = join(cwd, "+linked-output");
    await symlink(outside, linked);
    await expect(runTestSuite({ cwd, command: "node -e \"process.exit(0)\"", timeoutMs: 5_000, label: "linked", logRoot: linked })).rejects.toThrow(/symlink/);
    await expect(access(join(outside, "anything"))).rejects.toThrow();
  });

  it("keeps failure output only in the owner-only log and returns mechanical status", async () => {
    const cwd = await gitProjectCwd();
    const result = await runTestSuite({ cwd, command: `node -e "console.error('apiKey=SYNTHETIC_SECRET ${cwd}'); process.exit(2)"`, timeoutMs: 5_000, label: "failure" });
    expect(result.details.status).toBe("fail");
    expect(result.details.passed).toBe(false);
    expect(JSON.stringify(result.details)).not.toContain(cwd);
    expect(JSON.stringify(result.details)).not.toContain("SYNTHETIC_SECRET");
    expect(result.text).toContain("FAIL failure (exit 2");
    expect(result.text).not.toContain(cwd);
    expect(result.text).not.toContain("SYNTHETIC_SECRET");
    const logPath = join(cwd, "+test-output", result.details.logFile);
    expect(await readFile(logPath, "utf8")).toContain("SYNTHETIC_SECRET");
    const spawnFailure = await runTestSuite({ cwd, command: "pinot-no-such-executable", timeoutMs: 5_000, label: "spawn-failure" });
    expect(spawnFailure.details.status).toBe("fail");
    expect(spawnFailure.text).toContain("spawn failed");
    expect(spawnFailure.text).not.toMatch(/ENOENT|no such file/i);
    expect(JSON.stringify(spawnFailure.details)).not.toMatch(/ENOENT|no such file/i);
    expect(await readFile(join(cwd, "+test-output", spawnFailure.details.logFile), "utf8")).toMatch(/ENOENT|no such file/i);
  });

  it("settles a timed-out exact command", async () => {
    const cwd = await gitProjectCwd();
    const result = await runTestSuite({ cwd, command: "node -e \"setTimeout(() => {}, 10000)\"", timeoutMs: 1_000, label: "timeout" });
    expect(result.details.status).toBe("timeout");
    expect(result.details.timedOut).toBe(true);
    expect(result.details.passed).toBe(false);
  });

  it("cancels an exact command without shell cleanup", async () => {
    const cwd = await gitProjectCwd();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 25);
    const result = await runTestSuite({ cwd, command: "node -e \"setTimeout(() => {}, 10000)\"", timeoutMs: 5_000, label: "cancel" }, controller.signal);
    expect(result.details.status).toBe("cancel");
    expect(result.details.cancelled).toBe(true);
    expect(result.details.passed).toBe(false);
  });
});
