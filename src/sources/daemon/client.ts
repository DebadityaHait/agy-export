import http from "node:http";
import https from "node:https";
import { DaemonEndpoint } from "./discovery.js";

export interface DaemonFetchResult {
  steps: unknown[];
  sourceEndpoint: DaemonEndpoint;
  metadata?: Record<string, unknown>;
}

/**
 * Fetches conversation trajectory from a running Antigravity daemon on localhost.
 */
export async function fetchTrajectoryFromDaemon(
  endpoint: DaemonEndpoint,
  conversationId: string,
  timeoutMs = 5000
): Promise<DaemonFetchResult | null> {
  const routes = [
    {
      path: "/exa.language_server_pb.LanguageServerService/GetCascadeTrajectory",
      method: "POST",
      body: JSON.stringify({ cascadeId: conversationId, trajectoryId: conversationId })
    },
    {
      path: "/exa.language_server_pb.LanguageServerService/GetCascadeTrajectory",
      method: "POST",
      body: JSON.stringify({ cascade_id: conversationId })
    },
    {
      path: "/exa.language_server_pb.LanguageServerService/GetCascadeTrajectory",
      method: "POST",
      body: JSON.stringify({ trajectoryId: conversationId })
    },
    {
      path: "/jetski.product.v1.ConversationService/GetConversation",
      method: "POST",
      body: JSON.stringify({ conversationId })
    },
    {
      path: `/v1/conversations/${encodeURIComponent(conversationId)}`,
      method: "GET",
      body: ""
    }
  ];

  for (const route of routes) {
    try {
      const responseData = await makeLocalRpcRequest(endpoint, route.path, route.method, route.body, timeoutMs);
      if (responseData) {
        const parsed = parseDaemonTrajectoryResponse(responseData);
        if (parsed && Array.isArray(parsed.steps)) {
          return {
            steps: parsed.steps,
            sourceEndpoint: endpoint,
            metadata: parsed.metadata
          };
        }
      }
    } catch {
      // try next route
    }
  }

  return null;
}

function makeLocalRpcRequest(
  endpoint: DaemonEndpoint,
  path: string,
  method: string,
  body: string,
  timeoutMs: number
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1"
    };

    if (endpoint.csrfToken) {
      headers["X-Csrf-Token"] = endpoint.csrfToken;
    }

    if (body) {
      headers["Content-Length"] = String(Buffer.byteLength(body));
    }

    const transport = endpoint.protocol === "https" ? https : http;

    const req = transport.request(
      {
        hostname: "127.0.0.1",
        port: endpoint.port,
        path,
        method,
        headers,
        rejectUnauthorized: false,
        timeout: timeoutMs
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          return resolve(null);
        }

        let rawData = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          rawData += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(rawData);
            resolve(parsed);
          } catch (err) {
            reject(err);
          }
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Daemon request timed out"));
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function parseDaemonTrajectoryResponse(data: unknown): { steps: unknown[]; metadata?: Record<string, unknown> } | null {
  if (!data || typeof data !== "object") return null;

  const obj = data as Record<string, unknown>;

  // Response shape A: { steps: [...] }
  if (Array.isArray(obj.steps)) {
    return { steps: obj.steps, metadata: obj };
  }

  // Response shape B: { trajectory: { steps: [...] } }
  if (obj.trajectory && typeof obj.trajectory === "object") {
    const traj = obj.trajectory as Record<string, unknown>;
    if (Array.isArray(traj.steps)) {
      return { steps: traj.steps, metadata: traj };
    }
  }

  // Response shape C: { conversation: { steps: [...] } or { messages: [...] } }
  if (obj.conversation && typeof obj.conversation === "object") {
    const conv = obj.conversation as Record<string, unknown>;
    if (Array.isArray(conv.steps)) {
      return { steps: conv.steps, metadata: conv };
    }
    if (Array.isArray(conv.messages)) {
      return { steps: conv.messages, metadata: conv };
    }
  }

  // Response shape D: Array directly
  if (Array.isArray(obj)) {
    return { steps: obj };
  }

  // Response shape E: { events: [...] }
  if (Array.isArray(obj.events)) {
    return { steps: obj.events, metadata: obj };
  }

  return null;
}
