import http from "node:http";
import { AddressInfo } from "node:net";

export interface FakeDaemonOptions {
  mode?: "healthy" | "timeout" | "404" | "invalid_json" | "unknown_schema" | "large";
  customSteps?: Record<string, unknown[]>;
}

export class FakeDaemon {
  private server: http.Server | null = null;
  public port: number = 0;
  public mode: FakeDaemonOptions["mode"] = "healthy";
  public customSteps: Record<string, unknown[]> = {};

  constructor(options: FakeDaemonOptions = {}) {
    this.mode = options.mode || "healthy";
    this.customSteps = options.customSteps || {};
  }

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        if (this.mode === "timeout") {
          // Intentionally don't respond to trigger client timeout
          return;
        }

        if (this.mode === "404") {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "not found" }));
          return;
        }

        if (this.mode === "invalid_json") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<html>Not JSON</html>");
          return;
        }

        if (this.mode === "unknown_schema") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ futureProtoPayload: "xyz", unknownVersion: 99 }));
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });

        req.on("end", () => {
          let conversationId = "default";
          try {
            if (body) {
              const parsed = JSON.parse(body);
              conversationId =
                parsed.cascadeId ||
                parsed.cascade_id ||
                parsed.trajectoryId ||
                parsed.conversationId ||
                conversationId;
            } else if (req.url && req.url.includes("/conversations/")) {
              conversationId = req.url.split("/conversations/")[1] || conversationId;
            }
          } catch {
            // ignore
          }

          const steps = this.customSteps[conversationId] || this.getDefaultSteps(conversationId);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ steps }));
        });
      });

      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server?.address() as AddressInfo;
        this.port = addr.port;
        resolve(this.port);
      });

      this.server.on("error", reject);
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private getDefaultSteps(id: string): unknown[] {
    return [
      {
        type: "message",
        role: "user",
        timestamp: "2026-09-04T12:15:04.000Z",
        content: `The OAuth callback stopped working for conversation ${id}. Find and fix it.`
      },
      {
        type: "message",
        role: "assistant",
        timestamp: "2026-09-04T12:15:11.000Z",
        content: "I will inspect the authentication flow first."
      },
      {
        type: "tool_call",
        tool: "view_file",
        timestamp: "2026-09-04T12:15:13.000Z",
        input: { path: "src/auth.ts" }
      },
      {
        type: "tool_result",
        tool: "view_file",
        timestamp: "2026-09-04T12:15:14.000Z",
        content: "export function authenticate() { return null; }"
      },
      {
        type: "file_change",
        path: "src/auth.ts",
        operation: "modify",
        diff: "@@ -1,1 +1,1 @@\n-export function authenticate() { return null; }\n+export function authenticate() { return true; }\n"
      },
      {
        type: "command",
        command: "npm test",
        cwd: "D:\\projects\\ticktick",
        exit_code: 0,
        output: "47 tests passed"
      },
      {
        type: "message",
        role: "assistant",
        timestamp: "2026-09-04T12:16:00.000Z",
        content: "The authentication flow is fixed and all tests pass."
      }
    ];
  }
}
