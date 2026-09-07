import os from "node:os";
import { normalizeWorkspacePath } from "../sessions/paths.js";

/**
 * Redacts workspace and home directory paths from text.
 * E.g., D:\projects\ticktick\src\auth.ts -> <workspace>/src/auth.ts
 * C:\Users\deba\other\file.ts -> <home>/other/file.ts
 */
export function redactPathsInText(
  text: string,
  workspacePath?: string,
  homePath?: string
): string {
  if (!text || typeof text !== "string") {
    return text ?? "";
  }

  let result = text;
  const homeDir = homePath || os.homedir();

  // Helper to replace both Windows \ and / variations of a base path
  function replaceBasePath(fullText: string, basePath: string, placeholder: string): string {
    if (!basePath) return fullText;

    const norm = normalizeWorkspacePath(basePath);
    // Variants:
    // 1. Native Windows with backslashes
    const winBack = norm.replace(/\//g, "\\");
    // 2. Forward slashes
    const fwd = norm;

    // We replace longer paths first
    const escapedWin = winBack.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedFwd = fwd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const reWin = new RegExp(escapedWin, "gi");
    const reFwd = new RegExp(escapedFwd, "gi");

    return fullText.replace(reWin, placeholder).replace(reFwd, placeholder);
  }

  // 1. Redact workspace path first (more specific)
  if (workspacePath) {
    result = replaceBasePath(result, workspacePath, "<workspace>");
  }

  // 2. Redact home path second
  if (homeDir) {
    result = replaceBasePath(result, homeDir, "<home>");
  }

  return result;
}

/**
 * Recursively redacts paths in an object or array.
 */
export function redactPathsInObject<T>(
  obj: T,
  workspacePath?: string,
  homePath?: string
): T {
  function walk(current: unknown): unknown {
    if (typeof current === "string") {
      return redactPathsInText(current, workspacePath, homePath);
    }
    if (Array.isArray(current)) {
      return current.map(walk);
    }
    if (current !== null && typeof current === "object") {
      const copy: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(current)) {
        // Redact key if it looks like a path
        const newKey = redactPathsInText(key, workspacePath, homePath);
        copy[newKey] = walk(value);
      }
      return copy;
    }
    return current;
  }

  return walk(obj) as T;
}
