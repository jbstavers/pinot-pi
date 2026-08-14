export const MODEL_ROLES = ["scout", "assessor", "second-opinion", "implementer", "reviewer", "verifier"] as const;
export const IMPLEMENTER_EFFORTS = ["standard", "maximum"] as const;

export type ModelRole = (typeof MODEL_ROLES)[number];
export type ImplementerEffort = (typeof IMPLEMENTER_EFFORTS)[number];

export interface PinotConfig {
  version: 1;
  models: Record<ModelRole, string>;
  implementerEffort: Record<ImplementerEffort, string>;
  /** Optional user-selected extension that provides compatible external-source tools. */
  externalSourceExtension: string;
}

export const EMPTY_PINOT_CONFIG: PinotConfig = {
  version: 1,
  models: {
    scout: "",
    assessor: "",
    "second-opinion": "",
    implementer: "",
    reviewer: "",
    verifier: "",
  },
  implementerEffort: { standard: "", maximum: "" },
  externalSourceExtension: "",
};

export const MODEL_REFERENCE_PATTERN = /^[a-z0-9][a-z0-9_-]*\/[^\s:]+:(off|minimal|low|medium|high|xhigh|max)$/;

export function parsePinotConfig(text: string): PinotConfig {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`Pinot config is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Pinot config must be a JSON object.");
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !record.models || typeof record.models !== "object" || Array.isArray(record.models)) {
    throw new Error("Pinot config must have version 1 and a models object.");
  }
  if (!record.implementerEffort || typeof record.implementerEffort !== "object" || Array.isArray(record.implementerEffort)) {
    throw new Error("Pinot config must have an implementerEffort object.");
  }
  if (record.externalSourceExtension !== undefined && typeof record.externalSourceExtension !== "string") {
    throw new Error("externalSourceExtension must be a path or package name, or empty.");
  }
  const models = record.models as Record<string, unknown>;
  const implementerEffort = record.implementerEffort as Record<string, unknown>;
  const modelValues = {} as Record<ModelRole, string>;
  for (const role of MODEL_ROLES) modelValues[role] = validateModelValue(models[role], `models.${role}`);
  const effortValues = {} as Record<ImplementerEffort, string>;
  for (const effort of IMPLEMENTER_EFFORTS) effortValues[effort] = validateModelValue(implementerEffort[effort], `implementerEffort.${effort}`);
  if (Object.keys(models).some((key) => !(MODEL_ROLES as readonly string[]).includes(key))) throw new Error("Pinot config has an unknown model role.");
  if (Object.keys(implementerEffort).some((key) => !(IMPLEMENTER_EFFORTS as readonly string[]).includes(key))) throw new Error("Pinot config has an unknown implementer effort.");
  const externalSourceExtension = typeof record.externalSourceExtension === "string" ? record.externalSourceExtension : "";
  return { version: 1, models: modelValues, implementerEffort: effortValues, externalSourceExtension };
}

function validateModelValue(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  if (value !== "" && !MODEL_REFERENCE_PATTERN.test(value)) throw new Error(`${label} must use provider/model:thinking or be empty during setup.`);
  return value;
}

export function serializePinotConfig(config: PinotConfig = EMPTY_PINOT_CONFIG): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
