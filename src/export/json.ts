import { SCHEMA_V1_ID, SessionEvent, ExportEvent, JsonExportPayload } from "../schema/v1.js";

/**
 * Formats session and events into standard formatted JSON object.
 */
export function formatJson(session: SessionEvent, events: ExportEvent[]): string {
  const filteredEvents = events.filter((e) => e.type !== "session");

  const payload: JsonExportPayload = {
    schema: SCHEMA_V1_ID,
    session,
    events: filteredEvents
  };

  return JSON.stringify(payload, null, 2) + "\n";
}
