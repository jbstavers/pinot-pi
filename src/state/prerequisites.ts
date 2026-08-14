export type HerdrIntegrationValue = "installed" | "not-installed" | "unknown";
export type HerdrIntegrationCurrent = "current" | "not-current" | "unknown";

export interface HerdrIntegrationStatus {
  installed: HerdrIntegrationValue;
  current: HerdrIntegrationCurrent;
  detail?: string;
}

export interface PrerequisiteInput {
  nodeVersion: string;
  piLoaded: boolean;
  herdrAvailable: boolean;
  herdrIntegration: HerdrIntegrationStatus;
  herdrEnvironmentActive: boolean;
}

export interface PrerequisiteStatus {
  node: "available" | "unsupported";
  pi: "available" | "unavailable";
  herdr: "available" | "unavailable";
  herdrIntegration: HerdrIntegrationValue;
  herdrIntegrationCurrent: HerdrIntegrationCurrent;
  herdrEnvironment: "active" | "inactive";
}

export function evaluatePrerequisites(input: PrerequisiteInput): PrerequisiteStatus {
  return {
    node: supportsNode(input.nodeVersion) ? "available" : "unsupported",
    pi: input.piLoaded ? "available" : "unavailable",
    herdr: input.herdrAvailable ? "available" : "unavailable",
    herdrIntegration: input.herdrIntegration.installed,
    herdrIntegrationCurrent: input.herdrIntegration.current,
    herdrEnvironment: input.herdrEnvironmentActive ? "active" : "inactive",
  };
}

export function parseHerdrIntegrationStatus(stdout: string, _stderr: string, code: number): HerdrIntegrationStatus {
  if (code !== 0) return { installed: "unknown", current: "unknown" };
  const piLine = stdout.split(/\r?\n/).find((line) => /^\s*pi\s*:/i.test(line));
  if (!piLine) return { installed: "unknown", current: "unknown" };
  const state = piLine.slice(piLine.indexOf(":") + 1).split("(", 1)[0].trim().toLowerCase();
  if (/^current(?:\s|$)/.test(state)) return { installed: "installed", current: "current" };
  if (/^(?:not installed|missing|absent)(?:\s|$)/.test(state)) return { installed: "not-installed", current: "not-current" };
  if (/^(?:outdated|non[- ]current|not current|installed|enabled)(?:\s|$)/.test(state)) {
    return { installed: "installed", current: "not-current" };
  }
  return { installed: "unknown", current: "unknown" };
}

function supportsNode(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return major > 22 || (major === 22 && (minor > 19 || (minor === 19 && patch >= 0)));
}
