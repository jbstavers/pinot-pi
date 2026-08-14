import net from "node:net";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  IMPLEMENTER_CHILD_MARKER,
  IMPLEMENTER_LIFECYCLE_OWNER_MARKER,
} from "../guard.ts";

const HERDR_ENV = process.env.HERDR_ENV;
const socketPath = process.env.HERDR_SOCKET_PATH;
const socketEndpoint = process.platform === "win32" && socketPath ? `\\\\.\\pipe\\${socketPath}` : socketPath;
const paneId = process.env.HERDR_PANE_ID;
// The child deliberately disables Pi's discovered extensions, so this package-relative
// hook must publish through Herdr's native Pi source for agent_session to be authoritative.
const source = "herdr:pi";
const existingLifecycleOwner = process.env[IMPLEMENTER_LIFECYCLE_OWNER_MARKER];
const ownsLifecycle = HERDR_ENV === "1" && (!existingLifecycleOwner || existingLifecycleOwner === String(process.pid));

if (ownsLifecycle && !existingLifecycleOwner) process.env[IMPLEMENTER_LIFECYCLE_OWNER_MARKER] = String(process.pid);

function enabled(): boolean {
  return ownsLifecycle && process.env[IMPLEMENTER_CHILD_MARKER] === "1" && Boolean(socketPath) && Boolean(paneId);
}

function sendRequestAttempt(request: unknown, timeoutMs: number): Promise<boolean> {
  if (!enabled()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const socket = net.createConnection(socketEndpoint!);
    const finish = (delivered: boolean) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      socket.destroy();
      resolve(delivered);
    };
    socket.on("error", () => finish(false));
    socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("data", () => finish(true));
    socket.on("end", () => finish(false));
    timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref?.();
  });
}

async function sendRequest(request: unknown): Promise<void> {
  if (await sendRequestAttempt(request, 500)) return;
  await sendRequestAttempt(request, 1_500);
}

type AgentState = "working" | "blocked" | "idle";
type QueuedState = { state: AgentState; message?: string; seq: number };
let sequence = Date.now() * 1_000;
let sessionId: string | undefined;
let sessionPath: string | undefined;

function nextSequence(): number {
  sequence += 1;
  return sequence;
}

function updateSessionReference(ctx: any): void {
  try {
    const file = ctx?.sessionManager?.getSessionFile?.();
    sessionPath = typeof file === "string" && file.startsWith("/") ? file : undefined;
  } catch {
    sessionPath = undefined;
  }
  try {
    const id = ctx?.sessionManager?.getSessionId?.();
    sessionId = typeof id === "string" && id ? id : undefined;
  } catch {
    sessionId = undefined;
  }
}

function currentReference(): Record<string, string> | undefined {
  if (sessionPath) return { agent_session_path: sessionPath };
  if (sessionId) return { agent_session_id: sessionId };
  return undefined;
}

function reportSession(sessionStartSource?: string): Promise<void> {
  const reference = currentReference();
  if (!reference) return Promise.resolve();
  return sendRequest({
    id: `${source}:session:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    method: "pane.report_agent_session",
    params: {
      pane_id: paneId,
      source,
      agent: "pi",
      seq: nextSequence(),
      session_start_source: sessionStartSource,
      ...reference,
    },
  });
}

function sendState(state: AgentState, message?: string, seq = nextSequence()): Promise<void> {
  const reference = currentReference();
  return sendRequest({
    id: `${source}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    method: "pane.report_agent",
    params: { pane_id: paneId, source, agent: "pi", state, message, seq, ...(reference ?? {}) },
  });
}

function releaseAgent(): Promise<void> {
  return sendRequest({
    id: `${source}:release:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    method: "pane.release_agent",
    params: { pane_id: paneId, source, agent: "pi", seq: nextSequence() },
  });
}

export default function herdrAgentState(pi: ExtensionAPI): void {
  if (!enabled()) return;
  let rootSession = false;
  let active = false;
  let blockedCount = 0;
  let blockedMessage: string | undefined;
  let lastState: AgentState | undefined;
  let lastMessage: string | undefined;
  let sending = false;
  let queued: QueuedState | undefined;

  const desired = (): QueuedState => blockedCount > 0
    ? { state: "blocked", message: blockedMessage, seq: nextSequence() }
    : active
      ? { state: "working", seq: nextSequence() }
      : { state: "idle", seq: nextSequence() };

  const drain = async (): Promise<void> => {
    if (sending) return;
    sending = true;
    try {
      while (queued) {
        const next = queued;
        queued = undefined;
        await sendState(next.state, next.message, next.seq);
      }
    } finally {
      sending = false;
      if (queued) void drain();
    }
  };

  const publish = (force = false) => {
    const next = desired();
    if (!force && next.state === lastState && next.message === lastMessage) return;
    lastState = next.state;
    lastMessage = next.message;
    queued = next;
    void drain();
  };

  pi.events.on("herdr:blocked", (data: any) => {
    if (!rootSession) return;
    if (!data?.active) {
      blockedCount = Math.max(0, blockedCount - 1);
      if (blockedCount === 0) blockedMessage = undefined;
    } else {
      blockedCount += 1;
      blockedMessage = typeof data.label === "string" ? data.label : undefined;
    }
    publish();
  });

  pi.on("session_start", async (event: any, ctx: any) => {
    if (ctx?.hasUI !== true) return;
    rootSession = true;
    updateSessionReference(ctx);
    await reportSession(event?.reason);
    active = ctx?.isIdle?.() === false;
    publish(true);
  });

  pi.on("agent_start", (_event, ctx) => {
    if (!rootSession) return;
    updateSessionReference(ctx);
    void reportSession();
    active = true;
    publish();
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (!rootSession || ctx?.isIdle?.() !== true) return;
    active = false;
    publish();
  });

  pi.on("session_shutdown", async (event: any) => {
    if (rootSession && event?.reason === "quit") await releaseAgent();
  });
}
