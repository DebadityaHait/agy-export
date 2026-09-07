import fs from "node:fs";
import path from "node:path";
import { resolveDataDirectories } from "../../sessions/discovery.js";

export interface BrainFetchResult {
  filePath: string;
  steps: unknown[];
  metadata?: Record<string, unknown>;
}

/**
 * Searches for an unencrypted transcript file in Antigravity's brain store for the given conversation ID.
 */
export function findBrainTranscript(
  conversationId: string,
  options: { cwd?: string; dataDir?: string; workspace?: string } = {}
): BrainFetchResult | null {
  const { cliDirs, ideDirs } = resolveDataDirectories(options);
  const baseDirs: string[] = [];

  if (options.dataDir) {
    baseDirs.push(path.resolve(options.dataDir));
  }
  for (const d of [...cliDirs, ...ideDirs]) {
    if (!baseDirs.includes(d)) baseDirs.push(d);
  }

  const targetCwd = options.cwd || process.cwd();
  if (!baseDirs.includes(targetCwd)) baseDirs.push(targetCwd);
  if (options.workspace && !baseDirs.includes(options.workspace)) {
    baseDirs.push(options.workspace);
  }

  // Collect all brain store root directories
  const brainRoots: string[] = [];
  for (const dir of baseDirs) {
    if (path.basename(dir).toLowerCase() === "brain") {
      if (!brainRoots.includes(dir)) brainRoots.push(dir);
    }
    const brainSub = path.join(dir, "brain");
    if (fs.existsSync(brainSub) && !brainRoots.includes(brainSub)) {
      brainRoots.push(brainSub);
    }
    const dotAgyBrain = path.join(dir, ".antigravity", "brain");
    if (fs.existsSync(dotAgyBrain) && !brainRoots.includes(dotAgyBrain)) {
      brainRoots.push(dotAgyBrain);
    }
  }

  // Search each brain root for the conversation folder
  for (const bRoot of brainRoots) {
    let convDir: string | null = null;
    const direct = path.join(bRoot, conversationId);
    if (fs.existsSync(direct)) {
      convDir = direct;
    } else {
      try {
        const entries = fs.readdirSync(bRoot);
        const lowerId = conversationId.toLowerCase();
        const found =
          entries.find((e) => e.toLowerCase() === lowerId) ||
          entries.find((e) => e.toLowerCase().startsWith(lowerId));
        if (found) {
          convDir = path.join(bRoot, found);
        }
      } catch {
        // ignore
      }
    }

    if (!convDir) continue;

    const logsDir = path.join(convDir, ".system_generated", "logs");
    if (!fs.existsSync(logsDir)) continue;

    // A. Check full transcript or standard transcript first
    const primaryCandidates = [
      path.join(logsDir, "transcript_full.jsonl"),
      path.join(logsDir, "transcript.jsonl")
    ];

    for (const p of primaryCandidates) {
      if (fs.existsSync(p)) {
        try {
          const rawText = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
          const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
          const steps: unknown[] = [];
          for (const line of lines) {
            try {
              steps.push(JSON.parse(line));
            } catch {
              // skip malformed line
            }
          }
          return {
            filePath: p,
            steps
          };
        } catch {
          // skip
        }
      }
    }

    // B. Check multi-chunk logs BEFORE overview.txt
    const chunksParent = path.join(logsDir, "chunks");
    if (fs.existsSync(chunksParent)) {
      const chunkSubdirs = ["transcript_full", "transcript", "."];
      for (const sub of chunkSubdirs) {
        const chunkDir = path.join(chunksParent, sub);
        if (fs.existsSync(chunkDir)) {
          try {
            const files = fs
              .readdirSync(chunkDir)
              .filter((f) => f.endsWith(".jsonl"))
              .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
            const steps: unknown[] = [];
            for (const f of files) {
              const chunkPath = path.join(chunkDir, f);
              const rawText = fs.readFileSync(chunkPath, "utf8").replace(/^\uFEFF/, "");
              const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
              for (const line of lines) {
                try {
                  steps.push(JSON.parse(line));
                } catch {
                  // skip malformed line
                }
              }
            }
            if (steps.length > 0) {
              return {
                filePath: chunkDir,
                steps
              };
            }
          } catch {
            // ignore
          }
        }
      }
    }

    // C. Fallback to overview.txt only when full and chunk transcripts are absent
    const overviewPath = path.join(logsDir, "overview.txt");
    if (fs.existsSync(overviewPath)) {
      try {
        const rawText = fs.readFileSync(overviewPath, "utf8").replace(/^\uFEFF/, "");
        const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
        const steps: unknown[] = [];
        for (const line of lines) {
          try {
            steps.push(JSON.parse(line));
          } catch {
            // skip malformed line
          }
        }
        return {
          filePath: overviewPath,
          steps
        };
      } catch {
        // skip
      }
    }
  }

  return null;
}
