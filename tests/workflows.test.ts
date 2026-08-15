import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..");
const promptNames = ["pinot-spec", "pinot-plan", "pinot-implement", "pinot-debug", "pinot-debrief", "pinot-janitor"];

async function resource(name: string): Promise<string> {
  return readFile(join(root, "prompts", `${name}.md`), "utf8");
}

describe("public Pinot workflow resources", () => {
  it("has discoverable namespaced frontmatter and preserves argument passing", async () => {
    expect(await readdir(join(root, "prompts"))).toEqual(expect.arrayContaining(promptNames.map((name) => `${name}.md`)));
    for (const name of promptNames) {
      const source = await resource(name);
      expect(source.startsWith("---\n")).toBe(true);
      expect(source).toMatch(/description: .+/);
      expect(source).toContain("$@");
    }
  });

  it("keeps prompts public-safe and capability/configuration neutral", async () => {
    const sources = await Promise.all(promptNames.map(resource));
    const forbidden = [
      /\bJason\b|\bjstavers\b|\bLuna\b/i,
      /SharedResources|System-Management/i,
      /\/Users\//i,
      /\/home\/[^\s/]+/i,
      /(?:~\/\.pi\/|\.pi\/agent\/|\/private\/)/i,
      /\b(?:openai|anthropic|google|openrouter|moonshot|xai)\//i,
    ];
    for (const source of sources) for (const pattern of forbidden) expect(source).not.toMatch(pattern);
  });

  it("preserves each workflow's distinct behavioral contract", async () => {
    const sources = Object.fromEntries(await Promise.all(promptNames.map(async (name) => [name, await resource(name)] as const)));

    expect(sources["pinot-spec"]).toMatch(/outcome-changing question/i);
    expect(sources["pinot-spec"]).toMatch(/do not plan or implement/i);
    expect(sources["pinot-spec"]).toContain("Use external research only when requested or necessary");
    expect(sources["pinot-spec"]).toContain("implementation-specific system-contract research to `/pinot-plan`");
    expect(sources["pinot-plan"]).toMatch(/standalone implementation plan/i);
    expect(sources["pinot-plan"]).toMatch(/smallest coherent change/i);
    expect(sources["pinot-plan"]).toMatch(/exact integer budgets/i);
    expect(sources["pinot-plan"]).toMatch(/Stop for approval on .*unexpected subsystem/i);
    expect(sources["pinot-plan"]).toMatch(/credential or data-boundary redesign/i);
    expect(sources["pinot-plan"]).toMatch(/material scope or budget growth/i);
    expect(sources["pinot-plan"]).toMatch(/conditional \*\*Assignment seams\*\*/i);
    expect(sources["pinot-plan"]).toMatch(/\*\*execution routing\*\* only when .*independent review or higher-capability/i);

    expect(sources["pinot-implement"]).toMatch(/exactly one writer/i);
    expect(sources["pinot-implement"]).toMatch(/one focused, bounded edit-and-test cycle/i);
    expect(sources["pinot-implement"]).toMatch(/fresh checkpoint-v4/i);
    expect(sources["pinot-implement"]).toMatch(/review counts are authoritative/i);
    expect(sources["pinot-implement"]).toContain("pinot_run_test_suite");
    expect(sources["pinot-implement"]).toMatch(/one clean full rerun/i);
    expect(sources["pinot-implement"]).toMatch(/current-turn authorization before launching or focusing an app/i);
    expect(sources["pinot-implement"]).toMatch(/screenshot or direct reliable observation as visual QA/i);

    expect(sources["pinot-debug"]).toMatch(/evidence-first protocol/i);
    expect(sources["pinot-debug"]).toMatch(/discriminating check/i);
    expect(sources["pinot-debug"]).toContain("exactly one bounded durable `pinot_native_herdr_implementer`");
    expect(sources["pinot-debug"]).toMatch(/never root-edit/i);

    expect(sources["pinot-debrief"]).toContain("implementation-history` index");
    expect(sources["pinot-debrief"]).toMatch(/aggregate usage evidence/i);
    expect(sources["pinot-debrief"]).toMatch(/Do not implement fixes/i);

    expect(sources["pinot-janitor"]).toContain("`delete`, `retain`, or `unresolved`");
    expect(sources["pinot-janitor"]).toContain("start-only `janitor` profile");
    expect(sources["pinot-janitor"]).toMatch(/Never fall back to root editing/i);
  });

  it("preserves the package tool and Janitor reference contracts", async () => {
    const sources = await Promise.all(promptNames.map(resource));
    const all = sources.join("\n");
    expect(all).toContain("pinot_delegate_background");
    expect(all).toContain("pinot_native_herdr_implementer");
    expect(all).toContain("pinot_run_test_suite");
    expect(all).toContain("implementation-history");

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
