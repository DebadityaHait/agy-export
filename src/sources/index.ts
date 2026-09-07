import { ConversationSummary, ExportOptions } from "../schema/v1.js";
import { discoverDaemonEndpoints } from "./daemon/discovery.js";
import { fetchTrajectoryFromDaemon } from "./daemon/client.js";
import { findBrainTranscript } from "./brain/index.js";
import { findTrajectorySidecar } from "./sidecar/index.js";

export interface RetrievedTranscript {
  sourceType: "daemon" | "sidecar" | "brain";
  sourceDetail: string;
  steps: unknown[];
  metadata?: Record<string, unknown>;
}

export class TranscriptRetrievalError extends Error {
  public exitCode: number;
  public conversationId: string;

  constructor(message: string, exitCode: number, conversationId: string) {
    super(message);
    this.name = "TranscriptRetrievalError";
    this.exitCode = exitCode;
    this.conversationId = conversationId;
  }
}

/**
 * Retrieves the raw transcript steps for a given conversation.
 * Adheres to PRD Section 25-28:
 * 1. Live Antigravity local daemon
 * 2. Antigravity brain store transcript
 * 3. Compatible existing trajectory sidecar
 * 4. Actionable encrypted storage error (exit code 4)
 */
export async function retrieveTranscript(
  conversation: ConversationSummary,
  options: ExportOptions = {}
): Promise<RetrievedTranscript> {
  const sourcePreference = options.source || "auto";

  const searchOptions = {
    ...options,
    workspace: conversation.workspace || options.cwd
  };

  // 1. Try Live Daemon (if auto or daemon)
  if (sourcePreference === "auto" || sourcePreference === "daemon") {
    const endpoints = await discoverDaemonEndpoints(options);
    for (const ep of endpoints) {
      try {
        const daemonRes = await fetchTrajectoryFromDaemon(ep, conversation.id);
        if (daemonRes && Array.isArray(daemonRes.steps)) {
          return {
            sourceType: "daemon",
            sourceDetail: `localhost:${ep.port} (${ep.source})`,
            steps: daemonRes.steps,
            metadata: daemonRes.metadata
          };
        }
      } catch {
        // try next endpoint
      }
    }
  }

  // 2. Try Brain Store transcript (if auto or brain)
  if (sourcePreference === "auto" || sourcePreference === "brain") {
    const brainRes = findBrainTranscript(conversation.id, searchOptions);
    if (brainRes && Array.isArray(brainRes.steps)) {
      return {
        sourceType: "brain",
        sourceDetail: brainRes.filePath,
        steps: brainRes.steps,
        metadata: brainRes.metadata
      };
    }
  }

  // 3. Try Sidecar file (if auto or sidecar)
  if (sourcePreference === "auto" || sourcePreference === "sidecar") {
    const sidecarRes = findTrajectorySidecar(conversation.id, searchOptions);
    if (sidecarRes && Array.isArray(sidecarRes.steps)) {
      return {
        sourceType: "sidecar",
        sourceDetail: sidecarRes.filePath,
        steps: sidecarRes.steps,
        metadata: sidecarRes.metadata
      };
    }
  }

  // 3. Neither daemon nor sidecar yielded a readable decrypted transcript.
  // Display standard PRD Section 28 actionable error.
  const errorMessage = [
    "Conversation found, but its transcript is not currently readable.",
    "",
    "Antigravity stores this conversation encrypted at rest and no local",
    "Antigravity daemon is available to provide the decrypted trajectory.",
    "",
    "Start Antigravity CLI or Antigravity IDE, then retry:",
    "",
    `  agy-export ${conversation.id}`,
    "",
    "No Antigravity files were modified."
  ].join("\n");

  throw new TranscriptRetrievalError(errorMessage, 4, conversation.id);
}
