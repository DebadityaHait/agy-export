import crypto from "node:crypto";
import { ExportEvent, ToolResultEvent } from "../schema/v1.js";

export const DEFAULT_MAX_TOOL_OUTPUT = 16384; // 16 KB

export interface CompactReductionStats {
  originalToolBytes: number;
  exportedToolBytes: number;
  truncatedCount: number;
  deduplicatedCount: number;
}

/**
 * Deterministically reduces tool results and verbose events for compact mode.
 */
export class CompactReducer {
  private maxToolOutput: number;
  private stats: CompactReductionStats = {
    originalToolBytes: 0,
    exportedToolBytes: 0,
    truncatedCount: 0,
    deduplicatedCount: 0
  };
  private seenFileReads = new Map<string, string>(); // path -> content hash/signature

  constructor(maxToolOutput: number = DEFAULT_MAX_TOOL_OUTPUT) {
    this.maxToolOutput = maxToolOutput;
  }

  public getStats(): CompactReductionStats {
    return { ...this.stats };
  }

  public reduce(event: ExportEvent): ExportEvent | null {
    if (event.type !== "tool_result") {
      return event;
    }

    return this.reduceToolResult(event);
  }

  private reduceToolResult(event: ToolResultEvent): ToolResultEvent | null {
    const rawContent = event.content;
    const contentStr = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent ?? "");
    const originalBytes = Buffer.byteLength(contentStr, "utf8");
    this.stats.originalToolBytes += originalBytes;

    const tool = event.tool.toLowerCase();

    // 1. Directory listings reduction
    if (
      tool.includes("dir") ||
      tool.includes("list") ||
      (contentStr.includes("Directory of") || contentStr.includes("Mode                 LastWriteTime"))
    ) {
      const lines = contentStr.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length > 20 || originalBytes > 2048) {
        this.stats.truncatedCount++;
        const summary = event.summary || `Directory listing: ${lines.length} entries`;
        const exportedBytes = Buffer.byteLength(summary, "utf8");
        this.stats.exportedToolBytes += exportedBytes;
        return {
          ...event,
          content: undefined,
          summary,
          truncated: true,
          original_bytes: originalBytes,
          exported_bytes: exportedBytes
        };
      }
    }

    // 2. Repetitive file reads deduplication
    if (tool.includes("view_file") || tool.includes("read_file")) {
      // Robust content fingerprint using SHA-256
      const signature = crypto.createHash("sha256").update(contentStr).digest("hex");
      if (this.seenFileReads.has(signature)) {
        this.stats.deduplicatedCount++;
        const summary = "Duplicate file read content omitted";
        const exportedBytes = Buffer.byteLength(summary, "utf8");
        this.stats.exportedToolBytes += exportedBytes;
        return {
          ...event,
          content: undefined,
          summary,
          truncated: true,
          original_bytes: originalBytes,
          exported_bytes: exportedBytes
        };
      }
      this.seenFileReads.set(signature, "seen");
    }

    // 3. Build / compiler output noise reduction
    if (linesSuggestRepetitiveBuild(contentStr)) {
      const reduced = reduceBuildLog(contentStr);
      const exportedBytes = Buffer.byteLength(reduced, "utf8");
      if (exportedBytes < originalBytes) {
        this.stats.truncatedCount++;
        this.stats.exportedToolBytes += exportedBytes;
        return {
          ...event,
          content: reduced,
          truncated: true,
          original_bytes: originalBytes,
          exported_bytes: exportedBytes
        };
      }
    }

    // 4. General size truncation
    if (originalBytes > this.maxToolOutput) {
      this.stats.truncatedCount++;
      const truncatedText = contentStr.slice(0, this.maxToolOutput) + "\n... [TRUNCATED]";
      const exportedBytes = Buffer.byteLength(truncatedText, "utf8");
      this.stats.exportedToolBytes += exportedBytes;

      return {
        ...event,
        content: truncatedText,
        truncated: true,
        original_bytes: originalBytes,
        exported_bytes: exportedBytes
      };
    }

    this.stats.exportedToolBytes += originalBytes;
    return event;
  }
}

function linesSuggestRepetitiveBuild(text: string): boolean {
  if (text.length < 3000) return false;
  return (
    text.includes("Compiling") ||
    text.includes("Building") ||
    text.includes("webpack") ||
    text.includes("vite") ||
    text.includes("cargo") ||
    text.includes("ninja")
  );
}

function reduceBuildLog(text: string): string {
  const lines = text.split(/\r?\n/);
  if (lines.length < 50) return text;

  // Keep first 15 lines, lines with error/warning, and last 20 lines
  const head = lines.slice(0, 15);
  const tail = lines.slice(-20);
  const middle = lines.slice(15, -20);

  const errors = middle.filter((l) => /error|warn|fail|fatal|exception/i.test(l));

  const resultLines = [
    ...head,
    `... [${middle.length - errors.length} repetitive build lines omitted] ...`,
    ...errors,
    ...tail
  ];

  return resultLines.join("\n");
}
