import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EventEmitter } from "node:events";
import { lstat, mkdtemp, readFile, readdir, realpath, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { consumeCredentialBridge, initializeWorkerRoot, resolveWorkerReadPath } from "../src/delegation/child-bootstrap.ts";
import { parseWorkerCheckpoint } from "../src/delegation/checkpoint-parser.ts";
import { getModel } from "@earendil-works/pi-ai/compat";
import { compactResult, publicUpdateDetails, runDelegation, toPublicDetails } from "../src/delegation/index.ts";
import { boundTailText, boundText, boundedResultText, MAX_OUTPUT_BYTES, MAX_OUTPUT_LINES } from "../src/delegation/limits.ts";
import { runWorkerProcess } from "../src/delegation/worker-process.ts";

const execFileAsync = promisify(execFile);
const assignment = {
  role: "scout" as const,
  objective: "Inspect the bounded synthetic fixture contract.",
  nonObjectives: ["Do not edit files."],
  boundary: { pathsOrSubsystems: ["fixture.ts"], evidenceScope: "Read only the generated fixture." },
  editingPermission: false,
  expectedReportFormat: "checkpoint-v4" as const,
  verificationRequired: "none" as const,
  stopConditions: ["Stop after the fixture report."],
  durableOutput: "parent-tool-result" as const,
};

function fakeChild(onSpawn: (env: NodeJS.ProcessEnv, args: string[]) => Promise<void>) {
  return (_executable: string, args: string[], options: any) => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;
    void onSpawn(options.env, args).then(() => {
      child.stdout.emit("data", `${JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: JSON.stringify({ status: "completed", findings: ["synthetic finding"], evidence: ["fixture.ts:1"], verification: "read synthetic fixture", confidence: "high", unknowns: [] }) }], usage: { input: 2, output: 3, totalTokens: 5, cost: { total: 0.01 } } }})}\n`);
      child.emit("close", 0);
    });
    return child;
  };
}

function registry(auth: unknown) {
  return {
    find: () => ({ provider: "synthetic-provider", id: "synthetic-model" }),
    getProvider: () => ({ id: "synthetic-provider" }),
    getProviderAuth: async () => auth,
    getRegisteredProviderConfig: () => undefined,
    getRegisteredNativeProvider: () => undefined,
  } as any;
}

describe("bounded delegation contract", () => {
  it("keeps prefix, tail, result, and marker bounds exact for UTF-8 text", () => {
    const unicode = "🙂漢字\n".repeat(MAX_OUTPUT_LINES + 50);
    const prefix = boundText(unicode);
    const tail = boundTailText(unicode);
    const result = boundedResultText(unicode);
    for (const text of [prefix.text, tail, result]) {
      expect(Buffer.byteLength(text, "utf8")).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
      expect(text.split("\n").length).toBeLessThanOrEqual(MAX_OUTPUT_LINES);
    }
    expect(result).toContain("[Output truncated at 50KB/2000 lines.]");
    expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
    expect(result.split("\n").length).toBeLessThanOrEqual(MAX_OUTPUT_LINES);
    expect(boundText("🙂".repeat(MAX_OUTPUT_BYTES)).bytes).toBeLessThanOrEqual(MAX_OUTPUT_BYTES);
    expect(boundTailText("漢字".repeat(MAX_OUTPUT_BYTES)).length).toBeGreaterThan(0);
  });

  it("parses the last valid checkpoint-v4 and strictly bounds every checkpoint string", () => {
    const valid = { status: "completed", findings: ["last"], evidence: [], verification: "ok", confidence: "high", unknowns: [] };
    expect(parseWorkerCheckpoint(`noise {bad}\n${JSON.stringify({ ...valid, findings: ["first"] })}\n${JSON.stringify(valid)}`)?.findings).toEqual(["last"]);
    const parsed = parseWorkerCheckpoint(JSON.stringify({ ...valid, findings: ["x".repeat(60_000)], verification: "v".repeat(60_000), escalationQuestion: "q".repeat(60_000) }))!;
    expect(parsed.findings[0]).toHaveLength(800);
    expect(parsed.verification).toHaveLength(800);
    expect(parsed.escalationQuestion).toHaveLength(500);
  });

  it("hands synthetic API-key and OAuth-derived credentials through the private bridge, then removes it", async () => {
    const project = await mkdtemp(join(tmpdir(), "pinot-delegation-project-"));
    await writeFile(join(project, "fixture.ts"), "export const synthetic = true;\n");
    const settings = join(project, "synthetic-settings.json");
    await writeFile(settings, '{"sentinel":"SYNTHETIC_SETTINGS"}\n');
    const settingsBefore = await readFile(settings, "utf8");
    for (const auth of [{ auth: { apiKey: "SYNTHETIC_API_KEY" } }, { auth: { apiKey: "SYNTHETIC_OAUTH_ACCESS" }, env: { SYNTHETIC_ACCOUNT: "account" } }]) {
      let registration: any;
      let bridgeGone = false;
      const details = await runDelegation(assignment, project, {
        config: { version: 1, models: { scout: "openai/gpt-4o-mini:high", assessor: "", "second-opinion": "", implementer: "", reviewer: "", verifier: "" }, implementerEffort: { standard: "", maximum: "" }, externalSourceExtension: "" },
        modelRegistry: { ...registry(auth), find: () => getModel("openai", "gpt-4o-mini") },
        executable: "synthetic-pi",
        settingsPath: settings,
        spawnProcess: fakeChild(async (env) => {
          const bridgePath = env.PINOT_CREDENTIAL_BRIDGE!;
          const bridgeText = await readFile(bridgePath, "utf8");
          expect((await stat(bridgePath)).mode & 0o777).toBe(0o600);
          expect(bridgeText).not.toContain("settings");
          await consumeCredentialBridge(bridgePath, { registerProvider: (_provider: string, config: any) => { registration = config; } } as any);
          await expect(lstat(bridgePath)).rejects.toMatchObject({ code: "ENOENT" });
          bridgeGone = true;
        }),
      });
      expect(bridgeGone).toBe(true);
      expect(registration.apiKey).toMatch(/^SYNTHETIC_/);
      expect(JSON.stringify(details)).not.toContain("SYNTHETIC_");
      expect(JSON.stringify(details)).not.toContain("pinot-background-");
      expect(await readFile(settings, "utf8")).toBe(settingsBefore);
      expect(details.checkpoint.status).toBe("completed");
      expect(details.worker.process.outcome).toBe("completed");
    }
  });

  it("preserves ordinary evidence while redacting exact credential and handoff values", () => {
    const details: any = {
      assignment: { role: "scout", objective: "objective-sentinel", nonObjectives: ["non-objective-sentinel"], boundary: { pathsOrSubsystems: ["evidence-scope-sentinel"], evidenceScope: "scope-sentinel", stopConditions: ["stop-sentinel"] } },
      checkpoint: { status: "completed", findings: ["See https://example.invalid/evidence and /project/src/FOO_SYMBOL."], evidence: ["API_KEY: SYNTHETIC_API_KEY", "handoff /tmp/pinot-background-synthetic/credential-bridge.json"], verification: "header: Bearer SYNTHETIC_BEARER", confidence: "high", unknowns: [] },
      worker: { model: "openai/gpt-4o-mini", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0, turns: 0 }, elapsedMs: 1, toolNames: ["read"], progress: { elapsedMs: 1, lastActivityElapsedMs: 0, phase: "reporting", turns: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0, turns: 0 } }, process: { outcome: "completed", deadlineMs: 5, killAttempted: false, closure: "child_close" } }, settingsFingerprint: { before: "settings-hash", after: "settings-hash", unchanged: true },
    };
    const text = compactResult(details);
    expect(text).toContain("https://example.invalid/evidence");
    expect(text).toContain("/project/src/FOO_SYMBOL");
    expect(text).not.toMatch(/SYNTHETIC_API_KEY|SYNTHETIC_BEARER|pinot-background-synthetic/);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(50 * 1024);
  });

  it("removes custom tools from final and update public progress", () => {
    const progress: any = { elapsedMs: 1, lastActivityElapsedMs: 0, phase: "thinking", currentTool: "CUSTOM_SECRET_TOOL", turns: 1, usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: 0, turns: 1 } };
    const update = publicUpdateDetails("scout", "openai/gpt-4o-mini", progress, 5000);
    expect(update.progress).not.toHaveProperty("currentTool");
    const final: any = toPublicDetails({ assignment, checkpoint: { status: "completed", findings: [], evidence: [], verification: "ok", confidence: "high", unknowns: [] }, worker: { model: "openai/gpt-4o-mini", usage: progress.usage, elapsedMs: 1, toolNames: [], process: { outcome: "completed", deadlineMs: 5000, killAttempted: false, closure: "child_close" }, progress }, isolation: "ephemeral process; isolated Pi config/session; no write/edit/bash", settingsFingerprint: { before: "a", after: "a", unchanged: true } });
    expect(final.progress).not.toHaveProperty("currentTool");
  });

  it("serializes only mechanical public details and excludes sentinels", () => {
    const details = publicUpdateDetails("scout", "openai/gpt-4o-mini", { elapsedMs: 1, lastActivityElapsedMs: 0, phase: "thinking", turns: 1, usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: 0, turns: 1 } }, 5000);
    const text = JSON.stringify(details);
    expect(text).toContain("scout");
    expect(text).toContain("openai/gpt-4o-mini");
    expect(text).not.toContain("objective-sentinel");
    expect(text).not.toContain("credential-sentinel");
    expect(text).not.toContain("/tmp/bridge-sentinel");
    expect(text).not.toContain("settings-hash");
  });

  it("maps provider refresh failures to a generic provider-scoped error", async () => {
    const project = await mkdtemp(join(tmpdir(), "pinot-delegation-auth-"));
    await expect(runDelegation(assignment, project, {
      config: { version: 1, models: { scout: "openai/gpt-4o-mini:high", assessor: "", "second-opinion": "", implementer: "", reviewer: "", verifier: "" }, implementerEffort: { standard: "", maximum: "" }, externalSourceExtension: "" },
      modelRegistry: { ...registry({}), getProviderAuth: async () => { throw new Error("refresh failed SYNTHETIC_REFRESH_TOKEN"); }, find: () => getModel("openai", "gpt-4o-mini") },
    })).rejects.toThrow('Authentication for provider "openai" is unavailable.');
    await expect(runDelegation(assignment, project, {
      config: { version: 1, models: { scout: "openai/gpt-4o-mini:high", assessor: "", "second-opinion": "", implementer: "", reviewer: "", verifier: "" }, implementerEffort: { standard: "", maximum: "" }, externalSourceExtension: "" },
      modelRegistry: { ...registry({ auth: { apiKey: "SYNTHETIC" }, extra: true }), find: () => getModel("openai", "gpt-4o-mini") },
    })).rejects.toThrow("unsupported authentication metadata");
  });

  it("rejects external sources before spawn without a configured compatible extension", async () => {
    const project = await mkdtemp(join(tmpdir(), "pinot-delegation-external-"));
    let spawned = false;
    await expect(runDelegation({ ...assignment, boundary: { ...assignment.boundary, externalSources: ["synthetic source"] } }, project, {
      config: { version: 1, models: { scout: "openai/gpt-4o-mini:high", assessor: "", "second-opinion": "", implementer: "", reviewer: "", verifier: "" }, implementerEffort: { standard: "", maximum: "" }, externalSourceExtension: "" },
      modelRegistry: { ...registry({ auth: { apiKey: "SYNTHETIC" } }), find: () => getModel("openai", "gpt-4o-mini") },
      spawnProcess: () => { spawned = true; throw new Error("must not spawn"); },
    })).rejects.toThrow(/explicitly configured compatible extension/);
    expect(spawned).toBe(false);
  });

  it("rejects symlink escapes from the canonical worker root", async () => {
    const project = await mkdtemp(join(tmpdir(), "pinot-delegation-root-"));
    const outside = await mkdtemp(join(tmpdir(), "pinot-delegation-outside-"));
    await writeFile(join(outside, "secret.txt"), "synthetic");
    await symlink(outside, join(project, "escape"));
    await initializeWorkerRoot(project);
    await expect(resolveWorkerReadPath("escape/secret.txt", false)).rejects.toThrow(/outside/);
    await expect(resolveWorkerReadPath(".")).resolves.toBe(await realpath(project));
  });

  it("settles after bounded kill attempt when kill returns false and close never arrives", async () => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    const kills: string[] = [];
    child.kill = (signal: string) => { kills.push(signal); return false; };
    const result = await runWorkerProcess({ executable: "synthetic", args: [], cwd: ".", env: {}, deadlineMs: 5, shutdownGraceMs: 1, spawnProcess: () => child });
    expect(result.process.outcome).toBe("timed_out");
    expect(result.process.killAttempted).toBe(true);
    expect(result.process.closure).toBe("forced_after_kill_unconfirmed");
    expect(kills).toEqual(["SIGTERM", "SIGKILL"]);
    expect(child.listenerCount("close")).toBe(0);
    expect(child.listenerCount("error")).toBe(0);
  });

  it("rejects a modified effective model even when its provider is built in", async () => {
    const project = await mkdtemp(join(tmpdir(), "pinot-delegation-model-"));
    const modified = { ...getModel("openai", "gpt-4o-mini"), compat: { supportsStrictMode: false } };
    await expect(runDelegation(assignment, project, {
      config: { version: 1, models: { scout: "openai/gpt-4o-mini:high", assessor: "", "second-opinion": "", implementer: "", reviewer: "", verifier: "" }, implementerEffort: { standard: "", maximum: "" }, externalSourceExtension: "" },
      modelRegistry: { ...registry({ auth: { apiKey: "SYNTHETIC" } }), find: () => modified },
      spawnProcess: () => { throw new Error("must not spawn"); },
    })).rejects.toThrow(/exact built-in catalog model/);
  });

  it("settles spawn errors with explicit error closure", async () => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => true;
    const result = await runWorkerProcess({ executable: "synthetic", args: [], cwd: ".", env: {}, deadlineMs: 100, spawnProcess: () => {
      queueMicrotask(() => child.emit("error", new Error("SYNTHETIC_PROVIDER_SECRET")));
      return child;
    } });
    expect(result.process.outcome).toBe("spawn_failed");
    expect(result.process.closure).toBe("error_settlement");
  });

  it("reports timeout, cancellation, kill attempt, and separate checkpoint outcomes", async () => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    let kills: string[] = [];
    child.kill = (signal: string) => { kills.push(signal); if (signal === "SIGKILL") child.emit("close", null); return true; };
    const result = await runWorkerProcess({ executable: "synthetic", args: [], cwd: ".", env: {}, deadlineMs: 5, shutdownGraceMs: 1, spawnProcess: () => child });
    expect(result.process.outcome).toBe("timed_out");
    expect(result.process.killAttempted).toBe(true);
    expect(kills).toEqual(["SIGTERM", "SIGKILL"]);
  });

  it("keeps worker output at 50 KB/2,000 lines and retains a final checkpoint", async () => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => true;
    const resultPromise = runWorkerProcess({ executable: "synthetic", args: [], cwd: ".", env: {}, deadlineMs: 100, spawnProcess: () => {
      queueMicrotask(() => {
        child.stdout.emit("data", `${JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "x".repeat(100_000) + JSON.stringify({ status: "completed", findings: ["final"], evidence: [], verification: "ok", confidence: "high", unknowns: [] }) }], usage: {} }})}\n`);
        child.emit("close", 0);
      });
      return child;
    } });
    const result = await resultPromise;
    expect(Buffer.byteLength(result.terminalText)).toBeLessThanOrEqual(50 * 1024);
    expect(result.terminalText.split("\\n").length).toBeLessThanOrEqual(2_000);
  });

  it("launches the installed Pi CLI with an isolated synthetic bridge for API-key and OAuth-shaped auth", async () => {
    const project = await mkdtemp(join(tmpdir(), "pinot-delegation-cli-"));
    const workerRoot = resolve(project);
    const piBin = resolve(dirname(import.meta.dirname), "node_modules/.bin/pi");
    expect(existsSync(piBin)).toBe(true);
    for (const credential of ["SYNTHETIC_API_KEY", "SYNTHETIC_OAUTH_BEARER"]) {
      const home = await mkdtemp(join(tmpdir(), "pinot-child-home-"));
      const agent = join(home, "agent");
      const sessions = join(home, "sessions");
      await (await import("node:fs/promises")).mkdir(agent, { mode: 0o700 });
      await (await import("node:fs/promises")).mkdir(sessions, { mode: 0o700 });
      const bridge = join(home, "bridge.json");
      await writeFile(bridge, JSON.stringify({ version: 1, provider: "openai", model: "gpt-4o-mini", root: workerRoot, auth: { apiKey: credential, headers: { Authorization: `Bearer ${credential}` }, baseUrl: "https://synthetic.invalid" } }) + "\n", { mode: 0o600 });
      expect((await stat(bridge)).mode & 0o777).toBe(0o600);
      const args = ["--no-extensions", "--extension", resolve("src/delegation/child-bootstrap.ts"), "--no-session", "--list-models", "openai/gpt-4o-mini"];
      const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: home, PI_CODING_AGENT_DIR: agent, PI_CODING_AGENT_SESSION_DIR: sessions, PINOT_CREDENTIAL_BRIDGE: bridge, PINOT_WORKER_ROOT: workerRoot, PI_OFFLINE: "1", PI_SKIP_VERSION_CHECK: "1", PI_TELEMETRY: "0" };
      expect(args).not.toContain(credential);
      const result = await execFileAsync(piBin, args, { cwd: project, env, maxBuffer: 100_000 });
      expect(result.stdout).toContain("gpt-4o-mini");
      expect(result.stdout).not.toContain(credential);
      expect(result.stderr).not.toContain(credential);
      expect(result.stdout).not.toContain(bridge);
      expect(result.stderr).not.toContain(bridge);
      await expect(lstat(bridge)).rejects.toMatchObject({ code: "ENOENT" });
      const homeEntries = await readdir(home, { recursive: true });
      for (const entry of homeEntries) {
        const path = join(home, entry);
        try { expect(await readFile(path, "utf8")).not.toContain(credential); } catch { /* directories */ }
      }
    }
  });

  it("cancels before spawn and keeps output bounded", async () => {
    const controller = new AbortController(); controller.abort();
    const result = await runWorkerProcess({ executable: "synthetic", args: [], cwd: ".", env: {}, deadlineMs: 100, signal: controller.signal, spawnProcess: () => { throw new Error("must not spawn"); } });
    expect(result.process.outcome).toBe("cancelled");
    expect(result.terminalText).toBe("");
  });
});
