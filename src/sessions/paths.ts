import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

/**
 * Normalizes a workspace path or URI across Windows, macOS, Linux, and WSL.
 * Handles file:/// URIs, Windows drive letters, slashes, trailing slashes,
 * relative dot segments, and best-effort realpath resolution.
 */
export function normalizeWorkspacePath(inputPath: string): string {
  if (!inputPath || typeof inputPath !== "string") {
    return "";
  }

  let p = inputPath.trim();

  // Handle file:// URIs (e.g., file:///d%3A/k0de2/contribute3 or file://server/share)
  if (p.startsWith("file://")) {
    try {
      p = fileURLToPath(p);
    } catch {
      try {
        const url = new URL(p);
        p = decodeURIComponent(url.pathname);
        // On Windows, URL pathname begins with /D:/... so remove leading slash
        if (/^\/[a-zA-Z]:/.test(p)) {
          p = p.slice(1);
        }
      } catch {
        // Fallback if URL parsing fails
        p = p.replace(/^file:\/\/\/?/, "");
        try {
          p = decodeURIComponent(p);
        } catch {
          // ignore
        }
      }
    }
  }

  // Normalize all backslashes to forward slashes for internal consistency
  p = p.replace(/\\/g, "/");

  // Strip leading slash before Windows drive letters (e.g. "/d:/" -> "d:/", "/d:" -> "d:")
  if (/^\/[a-zA-Z]:(?:\/|$)/.test(p)) {
    p = p.slice(1);
  }

  // Handle Windows UNC paths: //server/share
  // On non-Windows platforms, redundant leading slashes are not UNC paths
  if (os.platform() !== "win32" && p.startsWith("//") && !p.startsWith("///")) {
    p = p.replace(/^\/+/, "/");
  }

  const isUnc = p.startsWith("//") && !p.startsWith("///");

  // Normalize dot segments (. and ..)
  p = path.posix.normalize(p);

  // Restore UNC double slash if it was collapsed by path.posix.normalize
  if (isUnc && !p.startsWith("//")) {
    p = "/" + p;
  }

  // Best effort realpath resolution (only for existing paths, avoid converting root "/" on Windows)
  if (p !== "/" && !isUnc) {
    try {
      const real = fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p);
      p = real.replace(/\\/g, "/");
    } catch {
      // Best-effort: if path doesn't exist on disk, continue with normalized path
    }
  }

  // On Windows, normalize drive letter to lowercase: e.g. "C:/" -> "c:/"
  if (/^[a-zA-Z]:\//.test(p) || /^[a-zA-Z]:$/.test(p)) {
    p = p[0].toLowerCase() + p.slice(1);
  }

  // Strip trailing slashes, unless it's the root like "c:/" or "/" or "//server/share"
  if (p.length > 1 && p.endsWith("/")) {
    if (!/^[a-zA-Z]:\/$/.test(p) && p !== "//") {
      p = p.slice(0, -1);
    }
  }

  return p;
}

/**
 * Compares two paths for workspace equivalence.
 * On Windows, comparison is case-insensitive.
 * On POSIX (Linux, macOS), comparison preserves case sensitivity.
 */
export function arePathsEqual(pathA: string, pathB: string): boolean {
  const normA = normalizeWorkspacePath(pathA);
  const normB = normalizeWorkspacePath(pathB);

  if (os.platform() === "win32") {
    return normA.toLowerCase() === normB.toLowerCase();
  }

  return normA === normB;
}

/**
 * Checks if a candidate path is within or equal to the target workspace directory.
 */
export function isPathInWorkspace(candidate: string, workspace: string): boolean {
  const normCand = normalizeWorkspacePath(candidate);
  const normWork = normalizeWorkspacePath(workspace);

  if (arePathsEqual(normCand, normWork)) {
    return true;
  }

  const workWithSlash = normWork.endsWith("/") ? normWork : normWork + "/";

  if (os.platform() === "win32") {
    return normCand.toLowerCase().startsWith(workWithSlash.toLowerCase());
  }

  return normCand.startsWith(workWithSlash);
}
