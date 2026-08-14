import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

describe("Pi package manifest", () => {
  it("declares only present resource paths and required peer boundaries", async () => {
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    expect(packageJson.name).toBe("@jbstavers/pinot-pi");
    expect(packageJson.displayName).toBe("Pinot");
    expect(packageJson.keywords).toContain("pi-package");
    expect(packageJson.pi.extensions).toEqual(["./extensions/pinot.ts"]);
    expect(packageJson.pi.skills).toEqual(["./skills"]);
    expect(packageJson.pi.prompts).toEqual(["./prompts"]);
    expect(packageJson.pi.themes).toEqual([]);
    expect(packageJson.files).toContain("PI-START-HERE.md");
    expect(packageJson.peerDependencies).toEqual({
      "@earendil-works/pi-ai": "*",
      "@earendil-works/pi-coding-agent": "*",
      typebox: "*",
    });
    expect(packageJson.dependencies ?? {}).toEqual({});
  });
});
