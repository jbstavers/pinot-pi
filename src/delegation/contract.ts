export const DELEGATION_ROLES = ["scout", "assessor", "second-opinion", "reviewer", "verifier"] as const;
export type DelegationRole = (typeof DELEGATION_ROLES)[number];

export interface DelegationAssignment {
  role: DelegationRole;
  objective: string;
  nonObjectives: string[];
  boundary: { pathsOrSubsystems: string[]; evidenceScope: string; externalSources?: string[] };
  editingPermission: boolean;
  expectedReportFormat: "checkpoint-v4";
  verificationRequired: "none" | "evidence-review";
  stopConditions: string[];
  durableOutput: "parent-tool-result";
  timeoutSeconds?: number;
}

export function validateAssignment(assignment: DelegationAssignment): string | undefined {
  if (assignment.editingPermission) return "Background delegation is read-only; editing belongs to the durable implementer path.";
  if (assignment.expectedReportFormat !== "checkpoint-v4") return "Background delegation requires checkpoint-v4 output.";
  if (/\b(find|locate)\s+and\s+fix\b|\bfix\s+(the\s+)?bug\b/i.test(assignment.objective)) {
    return "Overbroad assignment: name one bounded symptom, path, subsystem, or body of evidence.";
  }
  if (assignment.boundary.pathsOrSubsystems.some((value) => [".", "/", "entire codebase", "all files"].includes(value.trim().toLowerCase()))) {
    return "Overbroad boundary: name a bounded subsystem, path, or supplied evidence.";
  }
  if (/entire codebase|anything relevant|all files|wherever needed/i.test(assignment.boundary.evidenceScope)) {
    return "Overbroad evidence scope: specify the path, subsystem, symptom, diff, or sources to inspect.";
  }
  if (assignment.role === "verifier" && assignment.verificationRequired !== "evidence-review") {
    return "The verifier is evidence-only; require evidence-review and supply bounded evidence.";
  }
  if (assignment.role !== "verifier" && assignment.verificationRequired === "evidence-review" && assignment.boundary.pathsOrSubsystems.length === 0) {
    return "Evidence-review needs a supplied, bounded evidence location.";
  }
  if (assignment.boundary.externalSources?.length && assignment.role !== "scout") {
    return "External-source scouting is available only to the scout role.";
  }
  return undefined;
}
