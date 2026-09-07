import readline from "node:readline";
import { ConversationSummary } from "../schema/v1.js";

export interface PickerOptions {
  workspace: string;
  isAll: boolean;
}

/**
 * Renders an interactive, searchable terminal picker for selecting a conversation.
 * Handles arrow navigation, real-time query filtering, Enter to select, and Esc/Ctrl+C to quit.
 */
export async function runConversationPicker(
  conversations: ConversationSummary[],
  options: PickerOptions
): Promise<ConversationSummary | null> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive picker requires an interactive TTY terminal. Use --latest or specify an ID.");
  }

  let searchQuery = "";
  let selectedIndex = 0;
  let filteredList = filterConversations(conversations, searchQuery, options.isAll);

  // Setup raw stdin
  process.stdin.setRawMode(true);
  process.stdin.resume();
  readline.emitKeypressEvents(process.stdin);

  // Use alternate screen buffer and hide cursor to prevent scrollback repetition and redraw artifacts on Windows
  if (process.stdout.isTTY) {
    process.stdout.write("\x1b[?1049h\x1b[?25l");
  }

  function render() {
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;
    const lines = buildPickerLines(filteredList, options, searchQuery, selectedIndex, cols, rows);

    readline.cursorTo(process.stdout, 0, 0);
    process.stdout.write(lines.map((l) => l + "\x1b[K").join("\r\n") + "\r\n\x1b[J");
  }

  render();

  return new Promise<ConversationSummary | null>((resolve) => {
    let isCleanedUp = false;
    function cleanup() {
      if (isCleanedUp) return;
      isCleanedUp = true;
      process.removeListener("exit", cleanup);
      process.removeListener("SIGINT", onSigint);
      process.removeListener("SIGTERM", cleanup);
      process.stdin.removeListener("keypress", onKeypress);
      process.stdout.removeListener("resize", onResize);
      if (process.stdin.isTTY) {
        try {
          process.stdin.setRawMode(false);
        } catch {
          // ignore
        }
      }
      process.stdin.pause();
      if (process.stdout.isTTY) {
        process.stdout.write("\x1b[?25h\x1b[?1049l");
      }
    }

    function onSigint() {
      cleanup();
      process.exit(130);
    }

    process.once("exit", cleanup);
    process.once("SIGINT", onSigint);
    process.once("SIGTERM", cleanup);

    function onResize() {
      render();
    }
    process.stdout.on("resize", onResize);

    function onKeypress(_str: string, key: readline.Key) {
      if (!key) return;

      // Exit on Ctrl+C or Esc
      if ((key.ctrl && key.name === "c") || key.name === "escape") {
        cleanup();
        resolve(null);
        return;
      }

      // Enter to select
      if (key.name === "return") {
        cleanup();
        if (filteredList.length > 0 && selectedIndex >= 0 && selectedIndex < filteredList.length) {
          resolve(filteredList[selectedIndex]);
        } else {
          resolve(null);
        }
        return;
      }

      // Tab toggles workspace filter (PRD Section 33)
      if (key.name === "tab") {
        options.isAll = !options.isAll;
        filteredList = filterConversations(conversations, searchQuery, options.isAll);
        selectedIndex = 0;
        render();
        return;
      }

      // Navigation
      if (key.name === "up") {
        if (filteredList.length > 0) {
          selectedIndex = (selectedIndex - 1 + filteredList.length) % filteredList.length;
          render();
        }
        return;
      }

      if (key.name === "down") {
        if (filteredList.length > 0) {
          selectedIndex = (selectedIndex + 1) % filteredList.length;
          render();
        }
        return;
      }

      if (key.name === "pageup") {
        if (filteredList.length > 0) {
          selectedIndex = Math.max(0, selectedIndex - 5);
          render();
        }
        return;
      }

      if (key.name === "pagedown") {
        if (filteredList.length > 0) {
          selectedIndex = Math.min(filteredList.length - 1, selectedIndex + 5);
          render();
        }
        return;
      }

      if (key.name === "home") {
        if (filteredList.length > 0) {
          selectedIndex = 0;
          render();
        }
        return;
      }

      if (key.name === "end") {
        if (filteredList.length > 0) {
          selectedIndex = filteredList.length - 1;
          render();
        }
        return;
      }

      // Ctrl+U clears query
      if (key.ctrl && key.name === "u") {
        searchQuery = "";
        filteredList = filterConversations(conversations, searchQuery, options.isAll);
        selectedIndex = 0;
        render();
        return;
      }

      // Backspace
      if (key.name === "backspace") {
        if (searchQuery.length > 0) {
          searchQuery = searchQuery.slice(0, -1);
          filteredList = filterConversations(conversations, searchQuery, options.isAll);
          selectedIndex = 0;
          render();
        }
        return;
      }

      // Typing characters (printable chars only, excluding tabs or control keys)
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta && key.name !== "tab" && key.sequence >= " ") {
        searchQuery += key.sequence;
        filteredList = filterConversations(conversations, searchQuery, options.isAll);
        selectedIndex = 0;
        render();
      }
    }

    process.stdin.on("keypress", onKeypress);
  });
}

function filterConversations(
  list: ConversationSummary[],
  query: string,
  searchWorkspace: boolean
): ConversationSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;

  return list.filter((item) => {
    if (item.title && item.title.toLowerCase().includes(q)) return true;
    if (item.preview && item.preview.toLowerCase().includes(q)) return true;
    if (item.id && item.id.toLowerCase().includes(q)) return true;
    if (searchWorkspace && item.workspace && item.workspace.toLowerCase().includes(q)) return true;
    return false;
  });
}

function truncate(str: string, maxLen: number): string {
  if (maxLen <= 0) return "";
  if (str.length <= maxLen) return str;
  return str.slice(0, Math.max(0, maxLen - 1)) + "…";
}

function truncateLeft(str: string, maxLen: number): string {
  if (maxLen <= 0) return "";
  if (str.length <= maxLen) return str;
  return "…" + str.slice(-(maxLen - 1));
}

function formatTimeAgo(isoString?: string): string {
  if (!isoString) return "";
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (diffMs < 0) return "just now";
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return "";
  }
}

/**
 * Builds the lines to be rendered in the terminal picker.
 * Guarantees that no individual line contains an embedded newline and lines do not exceed columns.
 */
export function buildPickerLines(
  filteredList: ConversationSummary[],
  options: PickerOptions,
  searchQuery: string,
  selectedIndex: number,
  columns: number = process.stdout.columns || 80,
  rows: number = process.stdout.rows || 24
): string[] {
  const safeCols = Math.max(20, columns || 80);
  const maxLineWidth = safeCols - 1; // Strict 1-column margin to prevent wrapping on Windows console
  const safeRows = Math.max(5, rows || 24);
  const lines: string[] = [];

  const isCompact = safeRows < 14;
  const isMinimal = safeRows < 9;

  if (isMinimal) {
    const wsLabel = options.isAll ? "all" : truncate(options.workspace, Math.max(6, maxLineWidth - 18));
    lines.push(`  Antigravity (${wsLabel})`);
    const maxQueryLen = Math.max(5, maxLineWidth - 12);
    const displayQuery = searchQuery.length > maxQueryLen ? truncateLeft(searchQuery, maxQueryLen) : searchQuery;
    lines.push(`  Search: ${displayQuery}${searchQuery.length > 0 ? "" : "_"}`);
  } else if (isCompact) {
    lines.push(`  Antigravity conversations${options.isAll ? " (all)" : ""}`);
    if (!options.isAll) {
      const maxWsLen = Math.max(8, maxLineWidth - 4);
      lines.push(`  ${truncate(options.workspace, maxWsLen)}`);
    }
    const maxQueryLen = Math.max(5, maxLineWidth - 12);
    const displayQuery = searchQuery.length > maxQueryLen ? truncateLeft(searchQuery, maxQueryLen) : searchQuery;
    lines.push(`  Search: ${displayQuery}${searchQuery.length > 0 ? "" : "_"}`);
  } else {
    lines.push(`  Antigravity conversations${options.isAll ? " (all workspaces)" : ""}`);
    const maxWsLen = Math.max(8, maxLineWidth - 4);
    lines.push(`  ${truncate(options.workspace, maxWsLen)}`);
    lines.push("");
    const maxQueryLen = Math.max(5, maxLineWidth - 12);
    const displayQuery = searchQuery.length > maxQueryLen ? truncateLeft(searchQuery, maxQueryLen) : searchQuery;
    lines.push(`  Search: ${displayQuery}${searchQuery.length > 0 ? "" : "_"}`);
    lines.push("");
  }

  let footer = options.isAll
    ? "  ↑↓ nav   type search   enter export   tab workspace   esc quit"
    : "  ↑↓ nav   type search   enter export   tab all   esc quit";
  if (maxLineWidth < 60) {
    footer = options.isAll
      ? "  ↑↓ nav   type search   enter ok   tab ws   esc quit"
      : "  ↑↓ nav   type search   enter ok   tab all   esc quit";
  }
  if (maxLineWidth < 45) {
    footer = "  ↑↓ nav  enter ok  tab all  esc quit";
  }
  if (maxLineWidth < 30) {
    footer = "  ↑↓  enter  tab  esc";
  }

  const headerLinesCount = lines.length;
  const bottomOverhead = isMinimal ? 1 : (isCompact ? 2 : 4);
  const totalOverhead = headerLinesCount + bottomOverhead;
  const maxAllowedItems = Math.max(1, safeRows - totalOverhead - 1);
  const PAGE_SIZE = Math.max(1, Math.min(8, maxAllowedItems));

  const maxStartIndex = Math.max(0, filteredList.length - PAGE_SIZE);
  const startIndex = Math.max(0, Math.min(selectedIndex - Math.floor(PAGE_SIZE / 2), maxStartIndex));
  const visibleItems = filteredList.slice(startIndex, startIndex + PAGE_SIZE);

  if (filteredList.length === 0) {
    lines.push(truncate("    No conversations match your search.", maxLineWidth));
    if (!isCompact) lines.push("");
  } else {
    visibleItems.forEach((conv, idx) => {
      const globalIdx = startIndex + idx;
      const isSelected = globalIdx === selectedIndex;
      const cursor = isSelected ? "> " : "  ";
      const timeAgo = formatTimeAgo(conv.updated_at);
      const minReserved = 2 + (timeAgo ? timeAgo.length + 1 : 0);
      const availableTitleWidth = Math.max(5, maxLineWidth - minReserved);
      const titleStr = truncate(conv.title || `Conversation ${conv.id.slice(0, 8)}`, availableTitleWidth);
      if (timeAgo && maxLineWidth >= 35) {
        const paddedTitle = titleStr.padEnd(maxLineWidth - 2 - timeAgo.length - 1, " ");
        lines.push(`${cursor}${paddedTitle} ${timeAgo}`);
      } else {
        lines.push(`${cursor}${titleStr}`);
      }
    });
    if (!isCompact) lines.push("");
  }

  if (!isMinimal) {
    lines.push(`  ${filteredList.length} conversation${filteredList.length === 1 ? "" : "s"}`);
    if (!isCompact) lines.push("");
  }

  lines.push(footer);

  // Guarantee that every line is strictly within maxLineWidth and contains no newlines
  const clamped = lines.map((l) => (l.length > maxLineWidth ? l.slice(0, maxLineWidth) : l));
  if (clamped.length > safeRows) {
    return clamped.slice(0, safeRows);
  }
  return clamped;
}

