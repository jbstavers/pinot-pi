export type CheckpointStatus = "completed" | "incomplete" | "blocked";
export type CheckpointConfidence = "high" | "medium" | "low";

export interface Checkpoint {
  status: CheckpointStatus;
  findings: string[];
  evidence: string[];
  verification: string;
  confidence: CheckpointConfidence;
  unknowns: string[];
  escalationQuestion?: string;
}

const REQUIRED_FIELDS = ["status", "findings", "evidence", "verification", "confidence", "unknowns"] as const;
const ALLOWED_FIELDS = new Set([...REQUIRED_FIELDS, "escalationQuestion"]);
export const MAX_CHECKPOINT_STRING = 800;
export const MAX_ESCALATION_STRING = 500;

function balancedJsonObjects(text: string): string[] {
  const objects: string[] = [];
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index++) {
      const character = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === "{") depth++;
      else if (character === "}" && --depth === 0) {
        objects.push(text.slice(start, index + 1));
        break;
      }
    }
  }
  return objects;
}

function normalize(value: unknown): Checkpoint | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !ALLOWED_FIELDS.has(key))) return undefined;
  if (REQUIRED_FIELDS.some((key) => !(key in record))) return undefined;
  if (!(record.status === "completed" || record.status === "incomplete" || record.status === "blocked")) return undefined;
  if (!(record.confidence === "high" || record.confidence === "medium" || record.confidence === "low")) return undefined;
  if (!Array.isArray(record.findings) || !Array.isArray(record.evidence) || !Array.isArray(record.unknowns)) return undefined;
  if (typeof record.verification !== "string") return undefined;
  if ("escalationQuestion" in record && typeof record.escalationQuestion !== "string") return undefined;
  return {
    status: record.status,
    findings: record.findings.filter((item): item is string => typeof item === "string").slice(0, 6).map((item) => item.slice(0, MAX_CHECKPOINT_STRING)),
    evidence: record.evidence.filter((item): item is string => typeof item === "string").slice(0, 6).map((item) => item.slice(0, MAX_CHECKPOINT_STRING)),
    verification: record.verification.slice(0, MAX_CHECKPOINT_STRING),
    confidence: record.confidence,
    unknowns: record.unknowns.filter((item): item is string => typeof item === "string").slice(0, 6).map((item) => item.slice(0, MAX_CHECKPOINT_STRING)),
    ...(typeof record.escalationQuestion === "string" ? { escalationQuestion: record.escalationQuestion.slice(0, MAX_ESCALATION_STRING) } : {}),
  };
}

/** Parse the last valid checkpoint-v4 object without forwarding arbitrary worker prose. */
export function parseWorkerCheckpoint(text: string): Checkpoint | undefined {
  let checkpoint: Checkpoint | undefined;
  for (const body of balancedJsonObjects(text)) {
    try {
      checkpoint = normalize(JSON.parse(body)) ?? checkpoint;
    } catch {
      // Continue after malformed or unrelated JSON.
    }
  }
  return checkpoint;
}

export function checkpointFromWorkerText(text: string): Checkpoint {
  return parseWorkerCheckpoint(text) ?? {
    status: "incomplete",
    findings: ["Worker output was malformed; no raw output was passed to the parent."],
    evidence: [],
    verification: "Unable to verify due to malformed report.",
    confidence: "low",
    unknowns: ["Inspect or retry with a narrower assignment."],
    escalationQuestion: "Should this be retried with a narrower assignment?",
  };
}
