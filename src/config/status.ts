import {
  IMPLEMENTER_EFFORTS,
  MODEL_ROLES,
  parsePinotConfig,
  type ImplementerEffort,
  type ModelRole,
  type PinotConfig,
} from "./types.ts";

export interface ModelRegistryLookup {
  find(provider: string, modelId: string): unknown;
}

export interface ConfigStatusIssue {
  key: `models.${ModelRole}` | `implementerEffort.${ImplementerEffort}`;
  kind: "empty" | "unavailable";
  reference?: string;
  provider?: string;
  model?: string;
}

export interface ConfigStatus {
  state: "valid" | "invalid";
  issues: ConfigStatusIssue[];
  error?: string;
}

export function validateConfigStatus(text: string, registry: ModelRegistryLookup): ConfigStatus {
  let config: PinotConfig;
  try {
    config = parsePinotConfig(text);
  } catch (error) {
    return {
      state: "invalid",
      issues: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const issues: ConfigStatusIssue[] = [];
  for (const role of MODEL_ROLES) addMappingStatus(issues, `models.${role}`, config.models[role], registry);
  for (const effort of IMPLEMENTER_EFFORTS) addMappingStatus(issues, `implementerEffort.${effort}`, config.implementerEffort[effort], registry);
  return { state: "valid", issues };
}

function addMappingStatus(
  issues: ConfigStatusIssue[],
  key: ConfigStatusIssue["key"],
  reference: string,
  registry: ModelRegistryLookup,
): void {
  if (reference === "") {
    issues.push({ key, kind: "empty" });
    return;
  }
  const parsed = parseModelReference(reference);
  if (!parsed || registry.find(parsed.provider, parsed.model) === undefined) {
    issues.push({ key, kind: "unavailable", reference, provider: parsed?.provider, model: parsed?.model });
  }
}

export function parseModelReference(reference: string): { provider: string; model: string; thinking: string } | undefined {
  const match = /^([^/\s:]+)\/([^\s:]+):(off|minimal|low|medium|high|xhigh|max)$/.exec(reference);
  return match ? { provider: match[1], model: match[2], thinking: match[3] } : undefined;
}
