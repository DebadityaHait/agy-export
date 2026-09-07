import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { resolveDataDirectories, listConversations } from "../sessions/discovery.js";
import { discoverDaemonEndpoints, probeEndpoint } from "../sources/daemon/discovery.js";
import { ExportOptions } from "../schema/v1.js";

/**
 * Runs diagnostic checks and prints doctor report to console.
 */
export async function runDoctor(options: ExportOptions = {}): Promise<boolean> {
  const lines: string[] = [];
  lines.push("agy-export doctor\n");

  // 1. Node.js
  const nodeVer = process.version.replace(/^v/, "");
  lines.push("Node.js");
  lines.push(`  ✓ ${nodeVer}\n`);

  // 2. Platform
  lines.push("Platform");
  lines.push(`  ✓ ${os.platform()} ${os.arch()}\n`);

  // 3. Antigravity stores
  const { cliDirs, ideDirs } = resolveDataDirectories(options);

  lines.push("Antigravity CLI store");
  if (cliDirs.length > 0) {
    for (const dir of cliDirs) {
      lines.push(`  ✓ ${dir}`);
    }
  } else {
    lines.push("  ✗ not detected");
  }
  lines.push("");

  // 4. Conversation metadata
  const targetCwd = options.cwd || process.cwd();
  let totalConversations = 0;
  let workspaceMatches = 0;

  try {
    const allConvs = await listConversations({ all: true, dataDir: options.dataDir });
    totalConversations = allConvs.length;
    const wsConvs = await listConversations({ cwd: targetCwd, all: false, dataDir: options.dataDir });
    workspaceMatches = wsConvs.length;

    lines.push("Conversation metadata");
    lines.push(`  ✓ ${totalConversations} conversation${totalConversations === 1 ? "" : "s"}\n`);

    lines.push("Current workspace");
    lines.push(`  ✓ ${targetCwd}`);
    lines.push(`  ✓ ${workspaceMatches} matching conversation${workspaceMatches === 1 ? "" : "s"}\n`);
  } catch {
    lines.push("Conversation metadata");
    lines.push("  ✗ unable to read metadata\n");
  }

  // 5. Antigravity daemon
  let daemonReachable = false;
  lines.push("Antigravity daemon");
  try {
    const endpoints = await discoverDaemonEndpoints(options);
    if (endpoints.length > 0) {
      for (const ep of endpoints) {
        const isUp = await probeEndpoint(ep);
        if (isUp) {
          lines.push(`  ✓ localhost:${ep.port} (${ep.source})`);
          lines.push("  ✓ reachable");
          lines.push("  ✓ transcript RPC available");
          daemonReachable = true;
          break;
        }
      }
    }
  } catch {
    // ignore
  }

  if (!daemonReachable) {
    lines.push("  ✗ not detected\n");
    lines.push("Conversation metadata can be listed,");
    lines.push("but encrypted transcript content cannot currently be retrieved.\n");
    lines.push("Start Antigravity CLI or Antigravity IDE and retry.");
  }
  lines.push("");

  // 6. IDE store
  lines.push("IDE store");
  if (ideDirs.length > 0) {
    for (const dir of ideDirs) {
      lines.push(`  ✓ ${dir}`);
    }
  } else {
    lines.push("  not detected");
  }
  lines.push("");

  // 7. Disk transcripts (brain store)
  let diskTranscriptsFound = 0;
  for (const dir of [...cliDirs, ...ideDirs]) {
    const brainDir = path.join(dir, "brain");
    if (fs.existsSync(brainDir)) {
      try {
        const subdirs = fs.readdirSync(brainDir);
        for (const sub of subdirs) {
          if (
            fs.existsSync(path.join(brainDir, sub, ".system_generated", "logs", "transcript_full.jsonl")) ||
            fs.existsSync(path.join(brainDir, sub, ".system_generated", "logs", "transcript.jsonl")) ||
            fs.existsSync(path.join(brainDir, sub, ".system_generated", "logs", "overview.txt")) ||
            fs.existsSync(path.join(brainDir, sub, ".system_generated", "logs", "chunks"))
          ) {
            diskTranscriptsFound++;
          }
        }
      } catch {
        // ignore
      }
    }
  }

  if (diskTranscriptsFound > 0) {
    lines.push("Offline disk transcripts");
    lines.push(`  ✓ ${diskTranscriptsFound} unencrypted conversation transcript${diskTranscriptsFound === 1 ? "" : "s"} found in brain store\n`);
  }

  // 8. Overall capability
  lines.push("Export capability");
  const canExport = daemonReachable || diskTranscriptsFound > 0;
  if (canExport) {
    lines.push("  ✓ ready\n");
    lines.push("No problems detected.");
  } else {
    lines.push("  ✗ requires running Antigravity daemon to extract encrypted conversations");
  }

  process.stdout.write(lines.join("\n") + "\n");
  return canExport;
}
