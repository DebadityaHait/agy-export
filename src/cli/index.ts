#!/usr/bin/env node

import { Command } from "commander";
import process from "node:process";
import path from "node:path";
import { listConversations } from "../sessions/discovery.js";
import { exportConversation, ExportError } from "../export/index.js";
import { runDoctor } from "./doctor.js";
import { runConversationPicker, PickerExportOptions } from "./picker.js";
import { ExportOptions, SurfaceType, ExportFormat, ExportMode, SourceAdapterType } from "../schema/v1.js";
import { TranscriptRetrievalError } from "../sources/index.js";

const program = new Command();

program
  .name("agy-export")
  .description("Export a single Google Antigravity conversation cleanly.")
  .version("0.1.0")
  .argument("[conversation-id]", "Conversation ID or unique prefix to export")
  .option("--latest", "Export the newest conversation in the workspace")
  .option("--all", "Search/list conversations across all workspaces")
  .option("--cwd <path>", "Target workspace directory", process.cwd())
  .option("--surface <cli|ide|all>", "Filter by surface (cli, ide, all)", "all")
  .option("--format <jsonl|json|md>", "Output format (jsonl, json, md)", "jsonl")
  .option("--mode <full|compact|messages>", "Export mode (full, compact, messages)", "full")
  .option("--output <path>", "Output file path")
  .option("--stdout", "Print export content directly to stdout")
  .option("--force", "Overwrite existing output file if present")
  .option("--redact", "Redact secrets (API keys, tokens, credentials)")
  .option("--redact-paths", "Redact workspace and home directories from paths")
  .option("--include-tools", "Include tool calls and results (default)")
  .option("--exclude-tools", "Exclude tool calls and results")
  .option("--include-diffs", "Include file change diffs (default)")
  .option("--exclude-diffs", "Exclude diff bodies from file changes")
  .option("--list", "List available conversations")
  .option("--json", "Output machine-readable JSON (with --list)")
  .option("--source <auto|daemon|sidecar|brain>", "Preferred transcript source", "auto")
  .option("--data-dir <path>", "Override Antigravity data directory")
  .option("--max-tool-output <bytes>", "Maximum bytes per large tool output in compact mode", parseInt)
  .option("--doctor", "Check environment and Antigravity connectivity")
  .option("--debug", "Enable debug diagnostic output");

async function main() {
  program.parse(process.argv);

  const opts = program.opts();
  const args = program.args;

  const options: ExportOptions = {
    id: args[0],
    latest: opts.latest,
    all: opts.all,
    cwd: opts.cwd ? path.resolve(opts.cwd) : process.cwd(),
    surface: opts.surface as SurfaceType,
    format: opts.format as ExportFormat,
    mode: opts.mode as ExportMode,
    output: opts.output,
    stdout: opts.stdout,
    force: opts.force,
    redact: opts.redact,
    redactPaths: opts.redactPaths,
    includeTools: opts.includeTools,
    excludeTools: opts.excludeTools,
    includeDiffs: opts.includeDiffs,
    excludeDiffs: opts.excludeDiffs,
    source: opts.source as SourceAdapterType,
    dataDir: opts.dataDir,
    maxToolOutput: opts.maxToolOutput,
    doctor: opts.doctor,
    debug: opts.debug,
    list: opts.list,
    json: opts.json
  };

  // 1. Doctor command
  if (options.doctor) {
    await runDoctor(options);
    process.exit(0);
  }

  // 2. List command
  if (options.list) {
    const list = await listConversations({
      cwd: options.cwd,
      all: options.all,
      surface: options.surface,
      dataDir: options.dataDir,
      debug: options.debug
    });

    if (options.json) {
      const jsonOutput = list.map((item) => ({
        id: item.id,
        title: item.title,
        workspace: item.workspace,
        updated_at: item.updated_at,
        surface: item.surface
      }));
      process.stdout.write(JSON.stringify(jsonOutput, null, 2) + "\n");
      process.exit(0);
    }

    if (list.length === 0) {
      if (options.all) {
        process.stdout.write("No Antigravity conversations found.\n");
      } else {
        process.stdout.write(`No Antigravity conversations were found for:\n\n  ${options.cwd}\n\nTry:\n\n  agy-export --all\n`);
      }
      process.exit(0);
    }

    // Format human-readable table
    process.stdout.write("ID         TITLE                                    WORKSPACE                           UPDATED\n");
    for (const c of list) {
      const shortId = c.id.slice(0, 8).padEnd(10, " ");
      const title = truncate(c.title || `Conversation ${c.id.slice(0, 8)}`, 40).padEnd(42, " ");
      const ws = truncate(c.workspace || "", 35).padEnd(36, " ");
      const updated = formatShortTimeAgo(c.updated_at);
      process.stdout.write(`${shortId} ${title} ${ws} ${updated}\n`);
    }
    process.exit(0);
  }

  // 3. Selection: if no ID and not --latest, run picker
  if (!options.id && !options.latest) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      process.stderr.write("Error: Non-interactive terminal requires --latest or an explicit conversation ID.\n");
      process.exit(2);
    }

    const conversations = await listConversations({
      cwd: options.cwd,
      all: options.all,
      surface: options.surface,
      dataDir: options.dataDir,
      debug: options.debug
    });

    if (conversations.length === 0) {
      if (options.all) {
        process.stdout.write("No Antigravity conversations found.\n");
      } else {
        process.stdout.write(
          `No Antigravity conversations were found for:\n\n  ${options.cwd}\n\nTry:\n\n  agy-export --all\n`
        );
      }
      process.exit(0);
    }

    const initialExportOptions: PickerExportOptions = {
      format: options.format || "jsonl",
      mode: options.mode || "full",
      redact: Boolean(options.redact),
      includeTools: options.excludeTools ? false : true,
      includeDiffs: options.excludeDiffs ? false : true,
      redactPaths: Boolean(options.redactPaths)
    };

    const selected = await runConversationPicker(conversations, {
      workspace: options.cwd || process.cwd(),
      isAll: Boolean(options.all),
      exportOptions: initialExportOptions
    });

    if (!selected) {
      // User pressed Esc or Ctrl+C
      process.exit(0);
    }

    options.id = selected.conversation ? selected.conversation.id : selected.id;
    if (selected.options) {
      options.format = selected.options.format;
      options.mode = selected.options.mode;
      options.redact = selected.options.redact;
      if (selected.options.includeTools) {
        options.includeTools = true;
        options.excludeTools = false;
      } else {
        options.includeTools = false;
        options.excludeTools = true;
      }
      if (selected.options.includeDiffs) {
        options.includeDiffs = true;
        options.excludeDiffs = false;
      } else {
        options.includeDiffs = false;
        options.excludeDiffs = true;
      }
      if (selected.options.redactPaths !== undefined) {
        options.redactPaths = selected.options.redactPaths;
      }
    }
  }

  // 4. Export conversation
  const result = await exportConversation(options);

  // If writing to file (not stdout), print concise summary
  if (!options.stdout && result.outputPath) {
    const relName = path.basename(result.outputPath);
    const sizeKb = (result.stats.byteSize / 1024).toFixed(0);

    process.stdout.write(`✓ Exported\n\n  ${relName}\n\n`);
    process.stdout.write(`  ${result.stats.messageCount} messages\n`);
    process.stdout.write(`  ${result.stats.toolCallCount} tool calls\n`);
    process.stdout.write(`  ${result.stats.fileChangeCount} files changed\n`);
    process.stdout.write(`  ${sizeKb} KB\n`);

    if (options.mode === "compact" && result.stats.originalToolBytes && result.stats.exportedToolBytes !== undefined) {
      const origKb = (result.stats.originalToolBytes / 1024).toFixed(1);
      const expKb = (result.stats.exportedToolBytes / 1024).toFixed(1);
      process.stdout.write(`\n  Original visible tool output: ${origKb} KB\n`);
      process.stdout.write(`  Exported content:             ${expKb} KB\n`);
      process.stdout.write(`  Reduction:                    ${result.stats.reductionPercentage}%\n`);
    }
  }

  process.exit(0);
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

function formatShortTimeAgo(isoString?: string): string {
  if (!isoString) return "";
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (diffMs < 0) return "now";
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  } catch {
    return "";
  }
}

main().catch((err: unknown) => {
  let exitCode = 1;
  let message = "";

  if (err instanceof ExportError) {
    exitCode = err.exitCode;
    message = err.message;
  } else if (err instanceof TranscriptRetrievalError) {
    exitCode = err.exitCode;
    message = err.message;
  } else if (err instanceof Error) {
    message = err.message;
    if ("exitCode" in err && typeof (err as { exitCode: unknown }).exitCode === "number") {
      exitCode = (err as { exitCode: number }).exitCode;
    }
  } else {
    message = String(err);
  }

  process.stderr.write(`${message}\n`);

  if (process.argv.includes("--debug") && err instanceof Error && err.stack) {
    process.stderr.write(`\n${err.stack}\n`);
  }

  process.exit(exitCode);
});
