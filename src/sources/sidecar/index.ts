import fs from "node:fs";
import path from "node:path";
import { resolveDataDirectories } from "../../sessions/discovery.js";

export interface SidecarFetchResult {
  filePath: string;
  steps: unknown[];
  metadata?: Record<string, unknown>;
}

/**
 * Searches for a compatible trajectory sidecar file for the given conversation ID.
 */
export function findTrajectorySidecar(
  conversationId: string,
  options: { cwd?: string; dataDir?: string; workspace?: string } = {}
): SidecarFetchResult | null {
  const targetCwd = options.cwd || process.cwd();
  const filename = `${conversationId}.trajectory.json`;
  const lowerFilename = `${conversationId.toLowerCase()}.trajectory.json`;

  const candidateDirs: string[] = [
    targetCwd,
    path.join(targetCwd, ".antigravity")
  ];

  if (options.workspace && options.workspace !== targetCwd) {
    candidateDirs.push(options.workspace, path.join(options.workspace, ".antigravity"));
  }

  // Data directories
  const { cliDirs, ideDirs } = resolveDataDirectories(options);
  if (options.dataDir) {
    candidateDirs.push(path.resolve(options.dataDir), path.join(path.resolve(options.dataDir), "conversations"));
  }
  for (const dir of [...cliDirs, ...ideDirs]) {
    candidateDirs.push(dir, path.join(dir, "conversations"));
  }

  const candidatePaths: string[] = [];
  for (const d of candidateDirs) {
    candidatePaths.push(path.join(d, filename));
    if (filename !== lowerFilename) {
      candidatePaths.push(path.join(d, lowerFilename));
    }
  }

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const rawText = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
        const parsed = JSON.parse(rawText);
        const steps = extractStepsFromSidecar(parsed);
        if (steps && Array.isArray(steps)) {
          return {
            filePath: p,
            steps,
            metadata: typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined
          };
        }
      } catch {
        // Skip malformed sidecar file
      }
    }
  }

  return null;
}

function extractStepsFromSidecar(data: unknown): unknown[] | null {
  if (!data) return null;
  if (Array.isArray(data)) return data;

  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.steps)) return obj.steps;
    if (Array.isArray(obj.events)) return obj.events;
    if (Array.isArray(obj.trajectory)) return obj.trajectory;
    if (obj.conversation && typeof obj.conversation === "object") {
      const conv = obj.conversation as Record<string, unknown>;
      if (Array.isArray(conv.steps)) return conv.steps;
      if (Array.isArray(conv.messages)) return conv.messages;
    }
  }

  return null;
}
