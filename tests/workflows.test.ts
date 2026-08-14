import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const promptNames = ["pinot-spec", "pinot-plan", "pinot-implement", "pinot-debug", "pinot-debrief", "pinot-janitor"];
const forbidden = [
  /\bJason\b/i,
  /\bjstavers\b/i,
  /SharedResources|System-Management/i,
  /Luna/i,
  /\/Users\//i,
  /\/home\/[^\s/]+/i,
  /(?:~\/\.pi\/|\.pi\/agent\/|\/private\/)/i,
  /\b(?:openai|anthropic|google|openrouter|moonshot|xai)\//i,
];

async function resource(name: string): Promise<string> {
  return readFile(join(root, "prompts", `${name}.md`), "utf8");
}

describe("public Pinot workflow resources", () => {
  it("has discoverable frontmatter for all six namespaced prompts", async () => {
    expect(await readdir(join(root, "prompts"))).toEqual(expect.arrayContaining(promptNames.map((name) => `${name}.md`)));
    for (const name of promptNames) {
      const source = await resource(name);
      expect(source.startsWith("---\n")).toBe(true);
      expect(source).toMatch(/description: .+/);
      expect(name.startsWith("pinot-")).toBe(true);
      expect(source).toContain("$@");
    }
  });

  it("rewrites workflows without personal or machine/provider coupling", async () => {
    const sources = await Promise.all(promptNames.map(resource));
    for (const source of sources) for (const pattern of forbidden) expect(source).not.toMatch(pattern);
    const all = sources.join("\n");
    expect(all).toContain("pinot_delegate_background");
    expect(all).toContain("pinot_native_herdr_implementer");
    expect(all).toContain("pinot_run_test_suite");
    expect(all).toContain("HERDR_ENV=1");
    expect(all).toMatch(/never fall back/i);
    expect(all).toContain("implementation-history");
  });

  it("preserves required workflow judgments and Herdr refusal semantics", async () => {
    const sources = Object.fromEntries(await Promise.all(promptNames.map(async (name) => [name, await resource(name)] as const)));
    expect(sources["pinot-spec"]).toContain("outcome-changing question");
    expect(sources["pinot-plan"]).toContain("standalone implementation plan");
    expect(sources["pinot-implement"]).toContain("exactly one writer");
    expect(sources["pinot-implement"]).toContain("fresh checkpoint-v4");
    expect(sources["pinot-debug"]).toContain("discriminating check");
    expect(sources["pinot-debug"]).toContain("exactly one bounded durable `pinot_native_herdr_implementer`");
    expect(sources["pinot-debug"]).toMatch(/never root-edit/i);
    expect(sources["pinot-debrief"]).toContain("implementation-history index first");
    expect(sources["pinot-janitor"]).toContain("delete`, `retain`, or `unresolved");
    expect(sources["pinot-janitor"]).toContain("start-only `janitor` profile");
    expect(sources["pinot-janitor"]).toMatch(/never fall back to root editing/i);
  });

  it("keeps Janitor references package-relative and preserves the external history contract", async () => {
    const skill = await readFile(join(root, "skills/pinot-janitor/SKILL.md"), "utf8");
    expect(skill).toContain("references/implementation-handoff.md");
    expect(skill).toContain("references/implementation-history.md");
    expect(skill).toContain("sole writer");
    expect(skill).toContain("pinot_native_herdr_implementer");
    expect(skill).toContain("Never copy transcripts");
    const historyIndex = await readFile(join(root, "templates/implementation-history/index.md"), "utf8");
    const record = await readFile(join(root, "templates/implementation-history/record-template.md"), "utf8");
    for (const source of [historyIndex, record]) {
      expect(source).toContain("append-only");
      expect(source).toContain("semantic");
      expect(source).toContain("transcripts");
      expect(source).toContain("checkpoint bodies");
    }
    expect(record).toContain("Root Pi session");
    expect(record).toContain("Durable children");
    expect(record).toContain("Review and verification");
    expect(record).toContain("Debrief lookup");
    expect(record).toContain("Janitor maintenance");
  });
});
