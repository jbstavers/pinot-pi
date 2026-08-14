export const IMPLEMENTER_PROFILES = ["implementation", "janitor"] as const;
export type ImplementerProfile = (typeof IMPLEMENTER_PROFILES)[number];

export const IMPLEMENTER_PROFILE_ENTRY = "pinot-implementer-profile";
export const IMPLEMENTER_PROFILE_VERSION = 1 as const;
export const IMPLEMENTER_PROFILE_ENV = "PINOT_IMPLEMENTER_PROFILE";

export function isImplementerProfile(value: unknown): value is ImplementerProfile {
  return typeof value === "string" && (IMPLEMENTER_PROFILES as readonly string[]).includes(value);
}

/** Recover the immutable profile marker; reject malformed or conflicting markers. */
export function recoverImplementerProfileFromJsonl(jsonl: string): ImplementerProfile | undefined {
  let profile: ImplementerProfile | undefined;
  let found = false;
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let entry: unknown;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (record.type !== "custom" || record.customType !== IMPLEMENTER_PROFILE_ENTRY) continue;
    found = true;
    const data = record.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Implementer profile metadata is corrupt; refusing recovery.");
    const value = data as Record<string, unknown>;
    if (value.version !== IMPLEMENTER_PROFILE_VERSION || !isImplementerProfile(value.profile)) {
      throw new Error("Implementer profile metadata is invalid; refusing recovery.");
    }
    if (profile && profile !== value.profile) throw new Error("Implementer profile metadata conflicts; refusing recovery.");
    profile = value.profile;
  }
  return found ? profile : undefined;
}
