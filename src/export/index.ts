import fs from "node:fs";
import path from "node:path";
import {
  ConversationSummary,
  ExportOptions,
  ExportEvent,
  SessionEvent,
  SCHEMA_V1_ID
} from "../schema/v1.js";
import { listConversations } from "../sessions/discovery.js";
import { retrieveTranscript } from "../sources/index.js";
import { EventNormalizer } from "../normalization/normalize.js";
import { formatJsonl } from "./jsonl.js";
import { formatJson } from "./json.js";
import { formatMarkdown } from "./markdown.js";
import { generateFilename, resolveDestinationPath } from "./naming.js";
import { scanForPotentialSecrets } from "../privacy/redact.js";

export interface ExportResult {
  session: SessionEvent;
  outputPath?: string;
  isStdout: boolean;
  content: string;
  events: ExportEvent[];
  stats: {
    messageCount: number;
    toolCallCount: number;
    toolResultCount: number;
    fileChangeCount: number;
    commandCount: number;
    totalEvents: number;
    byteSize: number;
    redactedSecretsCount: number;
    originalToolBytes?: number;
    exportedToolBytes?: number;
    reductionPercentage?: string;
  };
}

export class ExportError extends Error {
  public exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "ExportError";
    this.exitCode = exitCode;
  }
}

/**
 * High-level programmatic API to export a single Antigravity conversation.
 */
export async function exportConversation(options: ExportOptions = {}): Promise<ExportResult> {
  const targetCwd = path.resolve(options.cwd || process.cwd());
  const format = options.format || "jsonl";

  // 1. Resolve which conversation to export
  const conversation = await resolveTargetConversation(options);

  // 2. Retrieve transcript from daemon or sidecar
  const transcript = await retrieveTranscript(conversation, options);

  // 3. Construct session header event
  const sessionEvent: SessionEvent = {
    schema: SCHEMA_V1_ID,
    type: "session",
    id: conversation.id,
    title: conversation.title || `Conversation ${conversation.id.slice(0, 8)}`,
    workspace: conversation.workspace || targetCwd,
    source: conversation.source || transcript.sourceDetail,
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
    surface: conversation.surface,
    step_count: conversation.step_count,
    project_id: conversation.project_id
  };

  // 4. Normalize events
  const normalizer = new EventNormalizer(sessionEvent.workspace, options);
  const normalizedEvents: ExportEvent[] = [];

  for (const step of transcript.steps) {
    const evts = normalizer.normalizeStep(step);
    normalizedEvents.push(...evts);
  }

  // 5. Format payload
  let outputContent = "";
  if (format === "jsonl") {
    outputContent = formatJsonl(sessionEvent, normalizedEvents);
  } else if (format === "json") {
    outputContent = formatJson(sessionEvent, normalizedEvents);
  } else if (format === "md") {
    outputContent = formatMarkdown(sessionEvent, normalizedEvents);
  } else {
    throw new ExportError(`Unsupported format: ${format}. Allowed: jsonl, json, md`, 2);
  }

  const byteSize = Buffer.byteLength(outputContent, "utf8");

  // Calculate statistics
  let messageCount = 0;
  let toolCallCount = 0;
  let toolResultCount = 0;
  let fileChangeCount = 0;
  let commandCount = 0;

  for (const evt of normalizedEvents) {
    if (evt.type === "message") messageCount++;
    else if (evt.type === "tool_call") toolCallCount++;
    else if (evt.type === "tool_result") toolResultCount++;
    else if (evt.type === "file_change") fileChangeCount++;
    else if (evt.type === "command") commandCount++;
  }

  const diag = normalizer.getDiagnostics();
  let reductionPercentage: string | undefined;
  if (diag.compactStats && diag.compactStats.originalToolBytes > 0) {
    const orig = diag.compactStats.originalToolBytes;
    const exp = diag.compactStats.exportedToolBytes;
    const pct = Math.max(0, ((orig - exp) / orig) * 100);
    reductionPercentage = pct.toFixed(1);
  }

  const resultStats = {
    messageCount,
    toolCallCount,
    toolResultCount,
    fileChangeCount,
    commandCount,
    totalEvents: normalizedEvents.length,
    byteSize,
    redactedSecretsCount: diag.redactedSecretsCount,
    originalToolBytes: diag.compactStats?.originalToolBytes,
    exportedToolBytes: diag.compactStats?.exportedToolBytes,
    reductionPercentage
  };

  // 6. Handle output: stdout vs file
  if (options.stdout) {
    process.stdout.write(outputContent);
    return {
      session: sessionEvent,
      isStdout: true,
      content: outputContent,
      events: normalizedEvents,
      stats: resultStats
    };
  }

  // File output
  const ext = format === "jsonl" ? "jsonl" : format === "json" ? "json" : "md";
  const defaultFilename = generateFilename(sessionEvent.title, sessionEvent.id, ext);
  const destDir = options.output ? path.dirname(path.resolve(options.output)) : targetCwd;

  const { outputPath } = resolveDestinationPath(destDir, defaultFilename, options.force, options.output);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, outputContent, "utf8");

  if (!options.redact && scanForPotentialSecrets(normalizedEvents)) {
    process.stderr.write("Warning: Potential credentials or secrets detected in exported conversation. Use --redact to sanitize.\n");
  }

  return {
    session: sessionEvent,
    outputPath,
    isStdout: false,
    content: outputContent,
    events: normalizedEvents,
    stats: resultStats
  };
}

/**
 * Resolves which conversation to export given ID, prefix, --latest, or selection.
 */
export async function resolveTargetConversation(options: ExportOptions): Promise<ConversationSummary> {
  const conversations = await listConversations({
    cwd: options.cwd,
    all: options.all || Boolean(options.id), // If explicit ID given, search across all
    surface: options.surface,
    dataDir: options.dataDir,
    debug: options.debug
  });

  if (options.id) {
    const searchId = options.id.trim().toLowerCase();

    // 1. Exact match
    const exact = conversations.find((c) => c.id.toLowerCase() === searchId);
    if (exact) return exact;

    // 2. Prefix match
    const prefixMatches = conversations.filter((c) => c.id.toLowerCase().startsWith(searchId));
    if (prefixMatches.length === 1) {
      return prefixMatches[0];
    }
    if (prefixMatches.length > 1) {
      const ids = prefixMatches.map((m) => `  - ${m.id} (${m.title})`).join("\n");
      throw new ExportError(
        `Ambiguous conversation ID prefix '${options.id}'. Multiple conversations matched:\n${ids}\nPlease specify a more unique ID.`,
        2
      );
    }

    throw new ExportError(`Conversation not found: ${options.id}`, 3);
  }

  if (options.latest) {
    if (conversations.length === 0) {
      const targetPath = options.cwd || process.cwd();
      throw new ExportError(
        `No Antigravity conversations were found for:\n\n  ${targetPath}\n\nTry:\n\n  agy-export --all`,
        3
      );
    }
    return conversations[0];
  }

  throw new ExportError("No conversation specified. Provide an ID or use --latest.", 2);
}
