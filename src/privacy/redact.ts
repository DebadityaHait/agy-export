export interface RedactionResult {
  text: string;
  redactedCount: number;
}

const REDACTION_PATTERNS: Array<{ regex: RegExp; replace: (...args: string[]) => string }> = [
  // Private keys
  {
    regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    replace: () => "[REDACTED]"
  },
  // GitHub tokens
  {
    regex: /\b(ghp_[a-zA-Z0-9]{36,}|gho_[a-zA-Z0-9]{36,}|ghu_[a-zA-Z0-9]{36,}|ghs_[a-zA-Z0-9]{36,}|ghr_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9_]{22,})\b/g,
    replace: () => "[REDACTED]"
  },
  // AWS Access Key ID
  {
    regex: /\b(AKIA[0-9A-Z]{16})\b/g,
    replace: () => "[REDACTED]"
  },
  // Google API keys
  {
    regex: /\b(AIzaSy[a-zA-Z0-9_-]{33})\b/g,
    replace: () => "[REDACTED]"
  },
  // OpenAI & generic sk- keys
  {
    regex: /\b(sk-[a-zA-Z0-9]{20,})\b/g,
    replace: () => "[REDACTED]"
  },
  // Bearer tokens
  {
    regex: /(Bearer\s+)[a-zA-Z0-9_\-.]{20,}/gi,
    replace: (_match, prefix: string) => `${prefix}[REDACTED]`
  },
  // JWT tokens
  {
    regex: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
    replace: () => "[REDACTED]"
  },
  // Common key-value secrets in configs/.env: API_KEY=..., SECRET_KEY=..., PASSWORD=...
  {
    regex: /((?:api[_-]?key|secret|token|password|auth_token)\s*[:=]\s*["']?)[a-zA-Z0-9_./+\-]{16,}(["']?)/gi,
    replace: (_match, prefix: string, suffix: string) => `${prefix}[REDACTED]${suffix || ""}`
  }
];

/**
 * Scans text and redacts detected secrets, replacing them with [REDACTED].
 */
export function redactSecrets(text: string): RedactionResult {
  if (!text || typeof text !== "string") {
    return { text: text ?? "", redactedCount: 0 };
  }

  let result = text;
  let count = 0;

  for (const { regex, replace } of REDACTION_PATTERNS) {
    result = result.replace(regex, (...args) => {
      count++;
      return replace(...args);
    });
  }

  return { text: result, redactedCount: count };
}

/**
 * Recursively redacts strings inside an object or array.
 */
export function redactObject<T>(obj: T): { value: T; redactedCount: number } {
  let totalCount = 0;

  function walk(current: unknown): unknown {
    if (typeof current === "string") {
      const { text, redactedCount } = redactSecrets(current);
      totalCount += redactedCount;
      return text;
    }
    if (Array.isArray(current)) {
      return current.map(walk);
    }
    if (current !== null && typeof current === "object") {
      const copy: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(current)) {
        copy[key] = walk(value);
      }
      return copy;
    }
    return current;
  }

  const value = walk(obj) as T;
  return { value, redactedCount: totalCount };
}

/**
 * Checks if text contains patterns matching known secrets or credentials.
 */
export function hasPotentialSecrets(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  for (const { regex } of REDACTION_PATTERNS) {
    const clone = new RegExp(regex.source, regex.flags);
    if (clone.test(text)) return true;
  }
  return false;
}

/**
 * Checks if any string inside an object/array contains potential secrets.
 */
export function scanForPotentialSecrets(obj: unknown): boolean {
  if (typeof obj === "string") {
    return hasPotentialSecrets(obj);
  }
  if (Array.isArray(obj)) {
    return obj.some(scanForPotentialSecrets);
  }
  if (obj !== null && typeof obj === "object") {
    for (const val of Object.values(obj)) {
      if (scanForPotentialSecrets(val)) return true;
    }
  }
  return false;
}
