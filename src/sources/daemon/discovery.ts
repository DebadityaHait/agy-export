import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import { resolveDataDirectories } from "../../sessions/discovery.js";

export interface DaemonEndpoint {
  port: number;
  protocol: "http" | "https";
  csrfToken?: string;
  source: "cli" | "ide";
  logFile?: string;
}

/**
 * Discovers active Antigravity daemon endpoints by inspecting recent CLI and IDE logs.
 */
export async function discoverDaemonEndpoints(options: { dataDir?: string; debug?: boolean } = {}): Promise<DaemonEndpoint[]> {
  const { cliDirs, ideDirs } = resolveDataDirectories(options);
  const candidates: DaemonEndpoint[] = [];

  // 1. Scan CLI logs
  for (const cliDir of cliDirs) {
    const logDir = path.join(cliDir, "log");
    if (fs.existsSync(logDir)) {
      const endpoints = findEndpointsInLogDirectory(logDir, "cli");
      candidates.push(...endpoints);
    }
  }

  // 2. Scan IDE logs
  for (const ideDir of ideDirs) {
    const logsDir = path.join(ideDir, "logs");
    if (fs.existsSync(logsDir)) {
      const endpoints = findEndpointsInIdeLogDirectory(logsDir);
      candidates.push(...endpoints);
    }
  }

  // 3. Filter and verify which endpoints are actually alive on localhost
  const aliveEndpoints: DaemonEndpoint[] = [];
  for (const ep of candidates) {
    const isAlive = await probeEndpoint(ep);
    if (isAlive) {
      aliveEndpoints.push(ep);
    }
  }

  return aliveEndpoints;
}

function findEndpointsInLogDirectory(logDir: string, source: "cli" | "ide"): DaemonEndpoint[] {
  const results: DaemonEndpoint[] = [];
  try {
    const files = fs
      .readdirSync(logDir)
      .filter((f) => f.endsWith(".log"))
      .map((f) => path.join(logDir, f));

    // Sort by modification time descending
    files.sort((a, b) => {
      try {
        return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
      } catch {
        return 0;
      }
    });

    // Inspect the latest 5 logs
    for (const file of files.slice(0, 5)) {
      try {
        const content = fs.readFileSync(file, "utf8");
        // Look for: Language server listening on random port at 63538 for HTTP or HTTPS
        const matches = content.matchAll(/Language server listening on random port at (\d+) for (HTTPS?)\b/g);
        const fileHttp: DaemonEndpoint[] = [];
        const fileHttps: DaemonEndpoint[] = [];
        for (const match of matches) {
          const port = parseInt(match[1], 10);
          const proto = match[2].toLowerCase() as "http" | "https";
          if (port > 0 && port < 65536 && !results.some((r) => r.port === port)) {
            const ep: DaemonEndpoint = {
              port,
              protocol: proto,
              source,
              logFile: file
            };
            if (proto === "http") {
              if (!fileHttp.some((r) => r.port === port)) fileHttp.push(ep);
            } else {
              if (!fileHttps.some((r) => r.port === port)) fileHttps.push(ep);
            }
          }
        }
        results.push(...fileHttp, ...fileHttps);
      } catch {
        // ignore read error
      }
    }
  } catch {
    // ignore
  }

  return results;
}

function findEndpointsInIdeLogDirectory(logsBaseDir: string): DaemonEndpoint[] {
  const results: DaemonEndpoint[] = [];
  try {
    const subdirs = fs.readdirSync(logsBaseDir).map((d) => path.join(logsBaseDir, d));
    // Sort directories descending (timestamped directories)
    subdirs.sort().reverse();

    for (const dir of subdirs.slice(0, 3)) {
      const lsLog = path.join(dir, "ls-main.log");
      if (fs.existsSync(lsLog)) {
        try {
          const content = fs.readFileSync(lsLog, "utf8");
          const matches = content.matchAll(/Language server listening on random port at (\d+) for (HTTPS?)\b/g);
          const csrfMatch = content.match(/--csrf_token\s+([a-f0-9-]+)/i);

          for (const match of matches) {
            const port = parseInt(match[1], 10);
            const proto = match[2].toLowerCase() as "http" | "https";
            if (port > 0 && port < 65536 && !results.some((r) => r.port === port)) {
              results.push({
                port,
                protocol: proto,
                csrfToken: csrfMatch ? csrfMatch[1] : undefined,
                source: "ide",
                logFile: lsLog
              });
            }
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
  return results;
}

/**
 * Quickly checks if an endpoint port is responsive on 127.0.0.1.
 * Timeout is strictly limited (500ms).
 */
export function probeEndpoint(ep: DaemonEndpoint, timeoutMs = 600): Promise<boolean> {
  return new Promise((resolve) => {
    const transport = ep.protocol === "https" ? https : http;
    const req = transport.request(
      {
        hostname: "127.0.0.1",
        port: ep.port,
        path: "/",
        method: "GET",
        rejectUnauthorized: false,
        timeout: timeoutMs
      },
      (res) => {
        res.resume();
        resolve(true);
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });

    req.on("error", () => {
      resolve(false);
    });

    req.end();
  });
}
