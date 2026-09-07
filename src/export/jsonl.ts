import { ExportEvent, SessionEvent } from "../schema/v1.js";

/**
 * Formats a stream of ExportEvents into JSONL string.
 * First line is the SessionEvent.
 */
export function formatJsonl(session: SessionEvent, events: ExportEvent[]): string {
  const lines: string[] = [];

  // Line 1: Canonical SessionEvent
  lines.push(JSON.stringify(session));

  for (const evt of events) {
    if (evt.type === "session") continue; // Avoid duplicate session headers
    lines.push(JSON.stringify(evt));
  }

  // Ensure trailing newline
  return lines.join("\n") + "\n";
}

/**
 * Serializes a single event to a JSONL line.
 */
export function serializeEventToJsonlLine(event: ExportEvent): string {
  return JSON.stringify(event) + "\n";
}
