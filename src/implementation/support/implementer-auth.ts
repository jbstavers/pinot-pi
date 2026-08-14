import { realpath } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { consumeCredentialBridge } from "../../delegation/child-bootstrap.ts";

export const IMPLEMENTER_AUTH_BRIDGE = "PINOT_IMPLEMENTER_AUTH_BRIDGE";
export const IMPLEMENTER_PROVIDER = "PINOT_IMPLEMENTER_PROVIDER";
export const IMPLEMENTER_MODEL = "PINOT_IMPLEMENTER_MODEL";

/** Consume the one-use parent handoff before the child makes a model request. */
export default async function implementerAuth(pi: ExtensionAPI): Promise<void> {
  const bridgePath = process.env[IMPLEMENTER_AUTH_BRIDGE];
  if (!bridgePath) throw new Error("Pinot implementer authentication handoff is unavailable.");
  const root = await realpath(process.cwd());
  try {
    const bridge = await consumeCredentialBridge(bridgePath, pi, {
      root,
      provider: process.env[IMPLEMENTER_PROVIDER],
      model: process.env[IMPLEMENTER_MODEL],
    });
    if (bridge.root !== root) throw new Error("Pinot implementer authentication handoff has the wrong project root.");
  } finally {
    delete process.env[IMPLEMENTER_AUTH_BRIDGE];
    delete process.env[IMPLEMENTER_PROVIDER];
    delete process.env[IMPLEMENTER_MODEL];
  }
}
