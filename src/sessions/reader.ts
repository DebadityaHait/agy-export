import { ExportEvent, ExportOptions, SessionEvent, SCHEMA_V1_ID } from "../schema/v1.js";
import { resolveTargetConversation } from "../export/index.js";
import { retrieveTranscript } from "../sources/index.js";
import { EventNormalizer } from "../normalization/normalize.js";

/**
 * Streaming API to read conversation events asynchronously.
 * Suitable for memory-efficient event iteration.
 */
export async function* readConversation(
  id: string,
  options: ExportOptions = {}
): AsyncIterable<ExportEvent> {
  const resolvedConv = await resolveTargetConversation({ ...options, id });
  const transcript = await retrieveTranscript(resolvedConv, options);

  const sessionEvent: SessionEvent = {
    schema: SCHEMA_V1_ID,
    type: "session",
    id: resolvedConv.id,
    title: resolvedConv.title || `Conversation ${resolvedConv.id.slice(0, 8)}`,
    workspace: resolvedConv.workspace,
    source: resolvedConv.source || transcript.sourceDetail,
    created_at: resolvedConv.created_at,
    updated_at: resolvedConv.updated_at,
    surface: resolvedConv.surface,
    step_count: resolvedConv.step_count,
    project_id: resolvedConv.project_id
  };

  yield sessionEvent;

  const normalizer = new EventNormalizer(sessionEvent.workspace, options);

  for (const step of transcript.steps) {
    const normalizedList = normalizer.normalizeStep(step);
    for (const evt of normalizedList) {
      yield evt;
    }
  }
}
