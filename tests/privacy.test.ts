import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");

function distributedFiles(): string[] {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8" });
  return (JSON.parse(output) as [{ files: Array<{ path: string }> }])[0].files.map((file) => file.path);
}

describe("distributed package privacy", () => {
  it("scans every package-dry-run file for private couplings and provider defaults", async () => {
    const files = distributedFiles();
    const text = (await Promise.all(files.map((file) => readFile(join(root, file), "utf8")))).join("\n");
    const forbiddenCouplings = [
      /\/Users\//i,
      /\/home\/[^~\s/]+/i,
      /\bjstavers\b/i,
      /\bJason\b/i,
      /private[-_](?:repository|config|auth|settings|session|checkpoint|report)/i,
      /(?:credential|secret)[-_](?:file|config)/i,
      /(?:~[\\/](?:[^\s"'`]+[\\/])*(?:auth|settings|sessions?|checkpoints?|reports?)(?:[\\/]\.?(?:json|jsonl|md)?\b)|[\\/]private[\\/]|[\\/]personal[\\/]|[\\/](?:auth|settings|sessions?|checkpoints?|reports?)\.(?:json|jsonl|md)\b|\+(?:agent-sessions|agent-checkpoints)\b)/i,
      /\b(?:openai|anthropic|google|openrouter|moonshot|xai)\/[^\s"'`]+/i,
    ];
    for (const pattern of forbiddenCouplings) expect(text).not.toMatch(pattern);
    expect(text).not.toMatch(/"(?:scout|assessor|second-opinion|implementer|reviewer|verifier)"\s*:\s*"[^" ]+"/);
    expect(files).toContain("package.json");
  });
});
