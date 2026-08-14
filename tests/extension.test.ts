import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import pinotExtension from "../extensions/pinot.ts";
import { EMPTY_PINOT_CONFIG, serializePinotConfig } from "../src/config/types.ts";

async function missing(path: string): Promise<boolean> {
  try { await access(path); return false; } catch { return true; }
}

describe("Pi command boundary", () => {
  it("registers without writing, then writes only after explicit setup", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "pinot-command-parent-")) + "/state";
    const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
    const notify = vi.fn();
    const fakePi = {
      registerCommand(name: string, command: { handler: (args: string, ctx: any) => Promise<void> }) { commands.set(name, command); },
      exec: vi.fn(async () => ({ code: 1, stdout: "", stderr: "" })),
    } as any;
    const previous = process.env.PINOT_STATE_DIR;
    process.env.PINOT_STATE_DIR = stateRoot;
    try {
      pinotExtension(fakePi);
      expect(await missing(stateRoot + "/config.json")).toBe(true);
      expect([...commands.keys()]).toEqual(["pinot-setup", "pinot-status"]);
      await commands.get("pinot-setup")!.handler("", { ui: { notify } });
      expect(notify).toHaveBeenCalledWith(expect.stringContaining("setup complete"), "info");
      expect(await missing(stateRoot + "/config.json")).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.PINOT_STATE_DIR;
      else process.env.PINOT_STATE_DIR = previous;
    }
  });

  it("registers the public bounded tool names without the private lifecycle alias", () => {
    const tools: string[] = [];
    const fakePi = {
      registerCommand() {},
      registerTool(tool: { name: string }) { tools.push(tool.name); },
    } as any;
    pinotExtension(fakePi);
    expect(tools).toEqual(["pinot_delegate_background", "pinot_native_herdr_implementer", "pinot_run_test_suite"]);
    expect(tools).not.toContain("pinot_herdr_implementer");
  });

  it("reports integration status independently of the active Herdr environment", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "pinot-status-parent-")) + "/state";
    const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
    const notify = vi.fn();
    const fakePi = {
      registerCommand(name: string, command: { handler: (args: string, ctx: any) => Promise<void> }) { commands.set(name, command); },
      exec: vi.fn(async (_command: string, args: string[]) => args.join(" ") === "integration status"
        ? { code: 0, stdout: "shell: not installed (/private/shell)\npi: current (v6) (/private/pi)\neditor: outdated (v2) (/private/editor)", stderr: "" }
        : { code: 0, stdout: "", stderr: "" }),
    } as any;
    const previous = process.env.PINOT_STATE_DIR;
    process.env.PINOT_STATE_DIR = stateRoot;
    delete process.env.HERDR_ENV;
    delete process.env.HERDR_SOCKET_PATH;
    try {
      pinotExtension(fakePi);
      await commands.get("pinot-setup")!.handler("", { ui: { notify } });
      await writeFile(join(stateRoot, "config.json"), serializePinotConfig({
        ...EMPTY_PINOT_CONFIG,
        models: { ...EMPTY_PINOT_CONFIG.models, scout: "provider/known:high", assessor: "provider/missing:low" },
      }), { mode: 0o600 });
      await commands.get("pinot-status")!.handler("", {
        ui: { notify },
        sessionManager: { getSessionFile: () => undefined },
        modelRegistry: { find: (_provider: string, model: string) => model === "known" ? { model } : undefined },
      });
      const lastCall = notify.mock.calls.at(-1);
      expect(lastCall).toBeDefined();
      const text = lastCall![0] as string;
      expect(text).toContain("models.assessor: unavailable (provider/missing:low)");
      expect(text).toContain("models.second-opinion: empty");
      expect(text).toContain("herdrIntegration: installed");
      expect(text).toContain("herdrIntegrationCurrent: current");
      expect(text).toContain("herdrEnvironment: inactive");
      expect(text).not.toContain("/private/pi");
      expect(fakePi.exec).toHaveBeenCalledWith("herdr", ["integration", "status"], { timeout: 2_000 });
    } finally {
      if (previous === undefined) delete process.env.PINOT_STATE_DIR;
      else process.env.PINOT_STATE_DIR = previous;
    }
  });
});
