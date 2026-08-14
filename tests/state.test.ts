import { chmod, lstat, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateConfigStatus } from "../src/config/status.ts";
import { EMPTY_PINOT_CONFIG, MODEL_REFERENCE_PATTERN, parsePinotConfig, serializePinotConfig } from "../src/config/types.ts";
import { evaluatePrerequisites, parseHerdrIntegrationStatus } from "../src/state/prerequisites.ts";
import { resolvePiLocations, resolveStatePaths, resolveStateRoot } from "../src/state/paths.ts";
import { inspectState, setupState, type SetupTemplates } from "../src/state/setup.ts";

const templates: SetupTemplates = {
  config: serializePinotConfig(),
  historyIndex: "# Empty history\n",
  historyRecord: "# Empty record template\n",
  ledgerReadme: "# Ledger\n",
};

async function isolatedHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "pinot-home-"));
}

describe("configuration", () => {
  it("accepts empty setup mappings and validates configured references", () => {
    expect(parsePinotConfig(serializePinotConfig())).toEqual(EMPTY_PINOT_CONFIG);
    expect(MODEL_REFERENCE_PATTERN.test("provider/model:high")).toBe(true);
    expect(MODEL_REFERENCE_PATTERN.test("provider/model")).toBe(false);
    expect(() => parsePinotConfig(JSON.stringify({ ...EMPTY_PINOT_CONFIG, models: { ...EMPTY_PINOT_CONFIG.models, scout: "invalid-model-reference" } }))).toThrow();
  });
});

describe("configuration status", () => {
  it("reports every empty mapping and unavailable registry model without reading auth", () => {
    const config = { ...EMPTY_PINOT_CONFIG, models: { ...EMPTY_PINOT_CONFIG.models, scout: "provider/known:high", assessor: "provider/missing:low" }, implementerEffort: { standard: "provider/known:medium", maximum: "" } };
    const status = validateConfigStatus(JSON.stringify(config), { find: (provider, model) => provider === "provider" && model === "known" ? { provider, model } : undefined });
    expect(status.state).toBe("valid");
    expect(status.issues).toEqual(expect.arrayContaining([
      { key: "models.assessor", kind: "unavailable", reference: "provider/missing:low", provider: "provider", model: "missing" },
      { key: "models.second-opinion", kind: "empty" },
      { key: "implementerEffort.maximum", kind: "empty" },
    ]));
    expect(status.issues).not.toEqual(expect.arrayContaining([{ key: "models.scout", kind: "unavailable" }]));
    expect(validateConfigStatus("not json", { find: () => undefined }).state).toBe("invalid");
  });
});

describe("state boundary", () => {
  it("sets the default and one absolute override without touching the filesystem", () => {
    const home = "/synthetic-home";
    expect(resolveStateRoot({ HOME: home })).toBe("/synthetic-home/.pinot-pi");
    expect(resolveStateRoot({ HOME: home, PINOT_STATE_DIR: "/synthetic-state" })).toBe("/synthetic-state");
    expect(() => resolveStateRoot({ HOME: home, PINOT_STATE_DIR: "relative" })).toThrow(/absolute/);
    expect(() => resolveStateRoot({ HOME: home, PINOT_STATE_DIR: "" })).toThrow();
  });

  it("discovers supported Pi locations without reading their contents", () => {
    expect(resolvePiLocations("/synthetic-home/.pi/agent", { PI_CODING_AGENT_SESSION_DIR: "/synthetic-sessions" }, "/synthetic-sessions/current.jsonl")).toEqual({
      agentDirectory: "/synthetic-home/.pi/agent",
      sessionDirectory: "/synthetic-sessions",
      currentSessionFile: "/synthetic-sessions/current.jsonl",
    });
  });

  it("initializes fresh state, preserves it on repeat, and uses owner-only modes", async () => {
    const home = await isolatedHome();
    const paths = resolveStatePaths({ HOME: home });
    const first = await setupState(paths, templates);
    expect(first.created).toHaveLength(11);
    const before = await readFile(paths.config, "utf8");
    const second = await setupState(paths, templates);
    expect(second.created).toHaveLength(0);
    expect(await readFile(paths.config, "utf8")).toBe(before);
    const status = await inspectState(paths);
    expect(status.config).toBe("valid");
    expect(status.entries.every((entry) => entry.kind === "directory" || entry.kind === "file")).toBe(true);
    for (const path of [paths.root, paths.implementationHistory, paths.implementationRoot, paths.implementationSessions, paths.implementationCheckpoints, paths.ledger, paths.ledgerReports]) {
      expect((await stat(path)).mode & 0o7777).toBe(0o700);
    }
    for (const path of [paths.config, join(paths.implementationHistory, "index.md"), join(paths.implementationHistory, "record-template.md"), join(paths.ledger, "README.md")]) {
      expect((await stat(path)).mode & 0o7777).toBe(0o600);
    }
  });

  it("refuses a conflicting root, nested path, symlink, or unsafe permissions", async () => {
    const home = await isolatedHome();
    const paths = resolveStatePaths({ HOME: home });
    await writeFile(paths.root, "conflict");
    await expect(setupState(paths, templates)).rejects.toThrow(/state root/);

    const preflightHome = await isolatedHome();
    const preflightPaths = resolveStatePaths({ HOME: preflightHome });
    const preflightConflict = join(preflightHome, "conflict-file");
    await writeFile(preflightConflict, "conflict");
    await expect(setupState({ ...preflightPaths, ledgerReports: preflightConflict }, templates)).rejects.toThrow(/non-directory/);
    await expect(lstat(preflightPaths.root)).rejects.toMatchObject({ code: "ENOENT" });

    const secondHome = await isolatedHome();
    const secondPaths = resolveStatePaths({ HOME: secondHome });
    await setupState(secondPaths, templates);
    await writeFile(secondPaths.implementationHistory + ".conflict", "x");
    await symlink(secondPaths.implementationHistory + ".conflict", join(secondPaths.root, "subagent-use-ledger", "reports", "linked"));
    await expect(setupState({ ...secondPaths, ledgerReports: join(secondPaths.root, "subagent-use-ledger", "reports", "linked") }, templates)).rejects.toThrow(/symlink/);

    const thirdHome = await isolatedHome();
    const thirdPaths = resolveStatePaths({ HOME: thirdHome });
    await setupState(thirdPaths, templates);
    await chmod(thirdPaths.root, 0o755);
    await expect(setupState(thirdPaths, templates)).rejects.toThrow(/permissions|unsafe mode/);
  });

  it("does not overwrite a user configuration or write into the package checkout", async () => {
    const home = await isolatedHome();
    const paths = resolveStatePaths({ HOME: home });
    await setupState(paths, templates);
    const userConfig = JSON.stringify({ ...EMPTY_PINOT_CONFIG, models: { ...EMPTY_PINOT_CONFIG.models, scout: "provider/model:low" } }, null, 2) + "\n";
    await writeFile(paths.config, userConfig, { mode: 0o600 });
    await setupState(paths, templates);
    expect(await readFile(paths.config, "utf8")).toBe(userConfig);
  });
});

describe("prerequisites", () => {
  it("reports availability without installing or selecting defaults", () => {
    expect(evaluatePrerequisites({ nodeVersion: "v22.19.0", piLoaded: true, pythonAvailable: false, herdrAvailable: true, herdrIntegration: { installed: "installed", current: "current" }, herdrEnvironmentActive: false })).toEqual({
      node: "available",
      pi: "available",
      python: "unavailable",
      herdr: "available",
      herdrIntegration: "installed",
      herdrIntegrationCurrent: "current",
      herdrEnvironment: "inactive",
      optionalWeb: "not required by bootstrap",
    });
    expect(evaluatePrerequisites({ nodeVersion: "v20.0.0", piLoaded: false, pythonAvailable: false, herdrAvailable: false, herdrIntegration: { installed: "unknown", current: "unknown" }, herdrEnvironmentActive: true }).node).toBe("unsupported");
  });

  it("selects only the exact pi line from realistic multi-line integration status", () => {
    const current = parseHerdrIntegrationStatus([
      "herdr integrations:",
      "  shell: not installed (/private/shell)",
      "  editor: outdated (v2) (/private/editor)",
      "  pi: current (v6) (/private/pi)",
      "  worker: not installed (/private/worker)",
    ].join("\n"), "", 0);
    expect(current).toEqual({ installed: "installed", current: "current" });
    expect(JSON.stringify(current)).not.toContain("/private/pi");

    expect(parseHerdrIntegrationStatus([
      "  shell: not installed (/private/shell)",
      "  pi: not installed (/private/pi)",
      "  editor: current (v3) (/private/editor)",
    ].join("\n"), "", 0)).toEqual({ installed: "not-installed", current: "not-current" });
    expect(parseHerdrIntegrationStatus([
      "  shell: not installed (/private/shell)",
      "  pi: outdated (v5) (/private/pi)",
      "  editor: current (v3) (/private/editor)",
    ].join("\n"), "", 0)).toEqual({ installed: "installed", current: "not-current" });
    expect(parseHerdrIntegrationStatus("shell: not installed (/private/shell)", "", 0)).toEqual({ installed: "unknown", current: "unknown" });
    expect(parseHerdrIntegrationStatus("", "permission denied: /private/herdr", 1)).toEqual({ installed: "unknown", current: "unknown" });
  });
});
