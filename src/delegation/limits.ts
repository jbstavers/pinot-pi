export const MAX_OUTPUT_BYTES = 50 * 1024;
export const MAX_OUTPUT_LINES = 2_000;

export interface BoundedText {
  text: string;
  truncated: boolean;
  bytes: number;
  lines: number;
}

function utf8Prefix(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  let text = Buffer.from(value, "utf8").subarray(0, maxBytes).toString("utf8");
  while (Buffer.byteLength(text, "utf8") > maxBytes) text = text.slice(0, -1);
  return text;
}

function utf8Tail(value: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  let text = Buffer.from(value, "utf8").subarray(-maxBytes).toString("utf8");
  while (Buffer.byteLength(text, "utf8") > maxBytes) text = text.slice(1);
  return text;
}

function boundedPrefix(value: string, maxBytes: number, maxLines: number): BoundedText {
  const lines = value.split("\n");
  let text = "";
  let keptLines = 0;
  let bytes = 0;
  for (const line of lines) {
    if (keptLines >= maxLines) break;
    const candidate = (keptLines === 0 ? "" : "\n") + line;
    const candidateBytes = Buffer.byteLength(candidate, "utf8");
    if (bytes + candidateBytes > maxBytes) {
      text += utf8Prefix(candidate, Math.max(0, maxBytes - bytes));
      return { text, truncated: true, bytes: Buffer.byteLength(text, "utf8"), lines: text.split("\n").length };
    }
    text += candidate;
    bytes += candidateBytes;
    keptLines++;
  }
  const truncated = keptLines < lines.length;
  return { text, truncated, bytes: Buffer.byteLength(text, "utf8"), lines: text.split("\n").length };
}

/** Keep worker-facing text bounded without retaining an unbounded line buffer. */
export function boundText(value: string): BoundedText {
  return boundedPrefix(value, MAX_OUTPUT_BYTES, MAX_OUTPUT_LINES);
}

export function boundTailText(value: string): string {
  const lines = value.split("\n").slice(-MAX_OUTPUT_LINES);
  const text = lines.join("\n");
  return Buffer.byteLength(text, "utf8") <= MAX_OUTPUT_BYTES ? text : utf8Tail(text, MAX_OUTPUT_BYTES);
}

const TRUNCATION_MARKER = "[Output truncated at 50KB/2000 lines.]";

export function boundedResultText(value: string): string {
  const result = boundText(value);
  if (!result.truncated) return result.text;
  const markerBytes = Buffer.byteLength(TRUNCATION_MARKER, "utf8");
  const prefix = boundedPrefix(value, MAX_OUTPUT_BYTES - markerBytes, MAX_OUTPUT_LINES - 1).text.replace(/\n+$/u, "");
  return `${prefix}${TRUNCATION_MARKER}`;
}
