import fs from "node:fs";
import path from "node:path";

/**
 * Creates a clean, deterministic, filesystem-safe slug from a conversation title.
 */
export function slugifyTitle(title?: string): string {
  if (!title || typeof title !== "string") {
    return "";
  }

  let slug = title.toLowerCase().trim();

  // Replace invalid characters on Windows/Linux/macOS (< > : " / \ | ? * and control chars)
  slug = slug.replace(/[<>:"/\\|?*\x00-\x1F]/g, "-");

  // Replace spaces and underscores with dashes
  slug = slug.replace(/[\s_]+/g, "-");

  // Remove any characters that are not alphanumeric, dashes, or unicode letters
  slug = slug.replace(/[^\p{L}\p{N}-]+/gu, "");

  // Collapse multiple dashes
  slug = slug.replace(/-+/g, "-");

  // Trim leading and trailing dashes or dots
  slug = slug.replace(/^[-.]+|[-.]+$/g, "");

  // Truncate to maximum 50 characters, avoiding trailing dash
  if (slug.length > 50) {
    slug = slug.slice(0, 50).replace(/-+$/, "");
  }

  return slug;
}

/**
 * Generates the deterministic filename according to PRD Section 21:
 * <title-slug>--<first-8-id>.<extension>
 * or conversation--<first-8-id>.<extension> if title is unavailable.
 */
export function generateFilename(title: string | undefined, id: string, extension: string): string {
  const cleanExt = extension.replace(/^\./, "").toLowerCase();
  const slug = slugifyTitle(title);
  const shortId = (id || "unknown").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "00000000";

  const prefix = slug.length > 0 ? slug : "conversation";
  return `${prefix}--${shortId}.${cleanExt}`;
}

export interface ResolvePathResult {
  outputPath: string;
  isExisting: boolean;
}

/**
 * Resolves the destination file path.
 * If explicitOutput is provided, fails if file exists unless force is true.
 * If default filename, appends -2, -3, etc. if file already exists.
 */
export function resolveDestinationPath(
  outputDir: string,
  baseFilename: string,
  force: boolean = false,
  explicitOutput?: string
): ResolvePathResult {
  if (explicitOutput) {
    const resolvedPath = path.resolve(explicitOutput);
    const exists = fs.existsSync(resolvedPath);
    if (exists && !force) {
      const err = new Error(`Output file already exists: ${explicitOutput}. Use --force to overwrite.`);
      (err as unknown as { code: string; exitCode: number }).code = "EEXIST";
      (err as unknown as { code: string; exitCode: number }).exitCode = 6;
      throw err;
    }
    return { outputPath: resolvedPath, isExisting: exists };
  }

  const resolvedDir = path.resolve(outputDir);
  const ext = path.extname(baseFilename);
  const stem = path.basename(baseFilename, ext);

  let candidatePath = path.join(resolvedDir, baseFilename);
  if (force || !fs.existsSync(candidatePath)) {
    return { outputPath: candidatePath, isExisting: fs.existsSync(candidatePath) };
  }

  // File already exists; find first available numbered suffix: -2, -3, etc.
  let counter = 2;
  while (true) {
    const numberedName = `${stem}-${counter}${ext}`;
    candidatePath = path.join(resolvedDir, numberedName);
    if (!fs.existsSync(candidatePath)) {
      return { outputPath: candidatePath, isExisting: false };
    }
    counter++;
  }
}
