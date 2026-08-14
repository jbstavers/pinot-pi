import { readFile } from "node:fs/promises";
import { getAgentDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { validateConfigStatus } from "../src/config/status.ts";
import { evaluatePrerequisites, parseHerdrIntegrationStatus } from "../src/state/prerequisites.ts";
import { resolvePiLocations, resolveStatePaths } from "../src/state/paths.ts";
import { inspectState, loadPackageTemplates, setupState } from "../src/state/setup.ts";
import { registerDelegationTool } from "../src/delegation/index.ts";
import { registerImplementerTool } from "../src/implementation/lifecycle.ts";
import { registerTestSuiteTool } from "../src/implementation/test-suite.ts";

async function commandAvailable(pi: ExtensionAPI, command: string): Promise<boolean> {
  try {
    const result = await pi.exec(command, ["--version"], { timeout: 2_000 });
    return result.code === 0;
  } catch {
    return false;
  }
}

async function herdrIntegrationStatus(pi: ExtensionAPI) {
  try {
    const result = await pi.exec("herdr", ["integration", "status"], { timeout: 2_000 });
    return parseHerdrIntegrationStatus(result.stdout, result.stderr, result.code);
  } catch {
    return parseHerdrIntegrationStatus("", "", 1);
  }
}

function formatState(status: Awaited<ReturnType<typeof inspectState>>): string {
  const lines = [`State root: ${status.paths.root}`, `Config: ${status.config}`];
  for (const entry of status.entries) lines.push(`${entry.path}: ${entry.kind}${entry.detail ? ` (${entry.detail})` : ""}`);
  return lines.join("\n");
}

function formatConfigStatus(status: ReturnType<typeof validateConfigStatus>): string {
  if (status.state === "invalid") return `Configuration mappings: invalid${status.error ? ` (${status.error})` : ""}`;
  if (status.issues.length === 0) return "Configuration mappings: all configured models are available.";
  const lines = [`Configuration mappings: ${status.issues.length} issue(s)`];
  for (const issue of status.issues) {
    lines.push(`- ${issue.key}: ${issue.kind}${issue.reference ? ` (${issue.reference})` : ""}`);
  }
  return lines.join("\n");
}

export default function pinotExtension(pi: ExtensionAPI): void {
  // The factory intentionally only registers commands. Do not add state reads or writes here.
  pi.registerCommand("pinot-setup", {
    description: "Explicitly initialize Pinot's user-owned state without overwriting existing files",
    handler: async (_args, ctx) => {
      const paths = resolveStatePaths();
      const result = await setupState(paths, await loadPackageTemplates());
      ctx.ui.notify(`Pinot setup complete. State root: ${paths.root}. ${result.created.length} path(s) created.`, "info");
    },
  });

  if (typeof pi.registerTool === "function") {
    registerDelegationTool(pi);
    registerImplementerTool(pi);
    registerTestSuiteTool(pi);
  }

  pi.registerCommand("pinot-status", {
    description: "Show Pinot state and prerequisite status without changing files",
    handler: async (_args, ctx) => {
      const paths = resolveStatePaths();
      const state = await inspectState(paths);
      const agentDirectory = getAgentDir();
      const sessionFile = ctx.sessionManager.getSessionFile();
      const piLocations = resolvePiLocations(agentDirectory, process.env, sessionFile);
      const prerequisites = evaluatePrerequisites({
        nodeVersion: process.version,
        piLoaded: true,
        herdrAvailable: await commandAvailable(pi, "herdr"),
        herdrIntegration: await herdrIntegrationStatus(pi),
        herdrEnvironmentActive: process.env.HERDR_ENV === "1" && Boolean(process.env.HERDR_SOCKET_PATH),
      });
      const configStatus = state.config === "valid"
        ? validateConfigStatus(await readFile(paths.config, "utf8"), ctx.modelRegistry)
        : undefined;
      const text = [
        formatState(state),
        configStatus ? formatConfigStatus(configStatus) : "Configuration mappings: unavailable until config.json is valid.",
        `Pi agent directory: ${piLocations.agentDirectory}`,
        `Pi session directory: ${piLocations.sessionDirectory}`,
        `Current session: ${piLocations.currentSessionFile ?? "ephemeral or unavailable"}`,
        "Prerequisites:",
        ...Object.entries(prerequisites).map(([name, value]) => `- ${name}: ${value}`),
      ].join("\n");
      ctx.ui.notify(text, "info");
    },
  });
}
