import readline from "node:readline";
import { ConversationSummary, ExportFormat, ExportMode } from "../schema/v1.js";

export interface PickerExportOptions {
  format: ExportFormat;
  mode: ExportMode;
  redact: boolean;
  includeTools: boolean;
  includeDiffs: boolean;
  redactPaths?: boolean;
}

export const DEFAULT_PICKER_EXPORT_OPTIONS: PickerExportOptions = {
  format: "jsonl",
  mode: "full",
  redact: false,
  includeTools: true,
  includeDiffs: true,
  redactPaths: false
};

export interface PickerOptions {
  workspace: string;
  isAll: boolean;
  exportOptions?: PickerExportOptions;
  optionsFocus?: boolean;
  focusedOptionIndex?: number;
}

export interface PickerResult extends ConversationSummary {
  conversation: ConversationSummary;
  options: PickerExportOptions;
}

export interface PickerState {
  searchQuery: string;
  selectedIndex: number;
  filteredList: ConversationSummary[];
  exportOptions: PickerExportOptions;
  optionsFocus: boolean;
  focusedOptionIndex: number;
}

export interface KeypressActionResult {
  shouldRender: boolean;
  done: boolean;
  result: PickerResult | null;
}

export function cycleFormat(current: ExportFormat): ExportFormat {
  const formats: ExportFormat[] = ["jsonl", "json", "md"];
  const idx = formats.indexOf(current);
  return formats[(idx + 1) % formats.length];
}

export function cycleMode(current: ExportMode): ExportMode {
  const modes: ExportMode[] = ["full", "compact", "messages"];
  const idx = modes.indexOf(current);
  return modes[(idx + 1) % modes.length];
}

export function toggleOption<K extends "redact" | "includeTools" | "includeDiffs" | "redactPaths">(
  options: PickerExportOptions,
  key: K
): PickerExportOptions {
  return {
    ...options,
    [key]: !options[key]
  };
}

export function toggleFocusedOption(state: PickerState): void {
  switch (state.focusedOptionIndex) {
    case 0:
      state.exportOptions.format = cycleFormat(state.exportOptions.format);
      break;
    case 1:
      state.exportOptions.mode = cycleMode(state.exportOptions.mode);
      break;
    case 2:
      state.exportOptions.redact = !state.exportOptions.redact;
      break;
    case 3:
      state.exportOptions.includeTools = !state.exportOptions.includeTools;
      break;
    case 4:
      state.exportOptions.includeDiffs = !state.exportOptions.includeDiffs;
      break;
  }
}

export function formatOptionsBar(
  exportOptions: PickerExportOptions,
  optionsFocus: boolean,
  focusedIndex: number,
  maxWidth: number
): string {
  const redVal = exportOptions.redact ? "ON" : "off";
  const tlsVal = exportOptions.includeTools ? "on" : "OFF";
  const difVal = exportOptions.includeDiffs ? "on" : "OFF";

  const fullItems = [
    { label: "format", value: exportOptions.format },
    { label: "mode", value: exportOptions.mode },
    { label: "redact", value: redVal },
    { label: "tools", value: tlsVal },
    { label: "diffs", value: difVal }
  ];

  const compactItems = [
    { label: "fmt", value: exportOptions.format },
    { label: "mode", value: exportOptions.mode },
    { label: "red", value: redVal },
    { label: "tls", value: tlsVal },
    { label: "dif", value: difVal }
  ];

  function renderPills(items: Array<{ label: string; value: string }>, separator: string, spaceAfterColon: boolean): string {
    return items
      .map((it, idx) => {
        const text = spaceAfterColon ? `${it.label}: ${it.value}` : `${it.label}:${it.value}`;
        return optionsFocus && idx === focusedIndex ? `>[${text}]<` : `[${text}]`;
      })
      .join(separator);
  }

  // 1. Try full with '  Options: ' and double space
  if (maxWidth >= 75) {
    let s = `  Options: ${renderPills(fullItems, "  ", true)}`;
    if (s.length <= maxWidth) return s;

    // 2. Try full with '  Options: ' and single space
    s = `  Options: ${renderPills(fullItems, " ", true)}`;
    if (s.length <= maxWidth) return s;
  }

  // 3. Try full labels with '  ' prefix
  let s = `  ${renderPills(fullItems, " ", true)}`;
  if (s.length <= maxWidth) return s;

  // 4. Try compact labels with space after colon
  s = `  ${renderPills(compactItems, " ", true)}`;
  if (s.length <= maxWidth) return s;

  // 5. Try compact labels with no space after colon
  s = `  ${renderPills(compactItems, " ", false)}`;
  if (s.length <= maxWidth) return s;

  // 6. Narrow (3 pills)
  const threePills = compactItems.slice(0, 3).map((it, idx) => {
    const text = `${it.label}:${it.value}`;
    return optionsFocus && idx === focusedIndex ? `>[${text}]<` : `[${text}]`;
  }).join(" ");
  s = `  ${threePills}`;
  if (s.length <= maxWidth) return s;

  // 7. Tiny (2 pills values only)
  const twoPills = compactItems.slice(0, 2).map((it, idx) => {
    const text = String(it.value);
    return optionsFocus && idx === focusedIndex ? `>[${text}]<` : `[${text}]`;
  }).join(" ");
  s = `  ${twoPills}`;
  if (s.length <= maxWidth) return s;

  // 8. Micro (1 pill value only)
  const onePill = optionsFocus && focusedIndex === 0 ? `>[${exportOptions.format}]<` : `[${exportOptions.format}]`;
  s = ` ${onePill}`;
  if (s.length <= maxWidth) return s;

  return s.slice(0, maxWidth);
}

export function handlePickerKeypress(
  state: PickerState,
  key: readline.Key,
  conversations: ConversationSummary[],
  options: PickerOptions
): KeypressActionResult {
  // 1. Exit on Ctrl+C or Esc
  if (key.ctrl && key.name === "c") {
    return { shouldRender: false, done: true, result: null };
  }

  if (key.name === "escape") {
    if (state.optionsFocus) {
      state.optionsFocus = false;
      return { shouldRender: true, done: false, result: null };
    }
    return { shouldRender: false, done: true, result: null };
  }

  // 2. Tab toggles workspace filter
  if (key.name === "tab") {
    options.isAll = !options.isAll;
    state.filteredList = filterConversations(conversations, state.searchQuery, options.isAll);
    state.selectedIndex = 0;
    return { shouldRender: true, done: false, result: null };
  }

  // 3. Ctrl+O / Alt+O / F2 toggles options focus mode
  if (((key.ctrl || key.meta) && key.name === "o") || key.name === "f2") {
    state.optionsFocus = !state.optionsFocus;
    return { shouldRender: true, done: false, result: null };
  }

  // 4. Dedicated hotkeys (work both when optionsFocus is true and false!)
  // Format: Ctrl+F, Alt+F, F3
  if (((key.ctrl || key.meta) && key.name === "f") || key.name === "f3") {
    state.exportOptions.format = cycleFormat(state.exportOptions.format);
    if (state.optionsFocus) state.focusedOptionIndex = 0;
    return { shouldRender: true, done: false, result: null };
  }

  // Mode: Alt+M, Ctrl+E, Ctrl+P, Alt+E, F4
  if (
    ((key.ctrl || key.meta) && (key.name === "e" || key.name === "p")) ||
    (key.meta && key.name === "m") ||
    key.name === "f4"
  ) {
    state.exportOptions.mode = cycleMode(state.exportOptions.mode);
    if (state.optionsFocus) state.focusedOptionIndex = 1;
    return { shouldRender: true, done: false, result: null };
  }

  // Redact: Ctrl+R, Alt+R, F6
  if (((key.ctrl || key.meta) && key.name === "r") || key.name === "f6") {
    state.exportOptions.redact = !state.exportOptions.redact;
    if (state.optionsFocus) state.focusedOptionIndex = 2;
    return { shouldRender: true, done: false, result: null };
  }

  // Tools: Ctrl+T, Alt+T, F7
  if (((key.ctrl || key.meta) && key.name === "t") || key.name === "f7") {
    state.exportOptions.includeTools = !state.exportOptions.includeTools;
    if (state.optionsFocus) state.focusedOptionIndex = 3;
    return { shouldRender: true, done: false, result: null };
  }

  // Diffs: Ctrl+D, Alt+D, F8
  if (((key.ctrl || key.meta) && key.name === "d") || key.name === "f8") {
    state.exportOptions.includeDiffs = !state.exportOptions.includeDiffs;
    if (state.optionsFocus) state.focusedOptionIndex = 4;
    return { shouldRender: true, done: false, result: null };
  }

  // 5. If Options focus is active:
  if (state.optionsFocus) {
    if (key.name === "left") {
      state.focusedOptionIndex = (state.focusedOptionIndex - 1 + 5) % 5;
      return { shouldRender: true, done: false, result: null };
    }

    if (key.name === "right") {
      state.focusedOptionIndex = (state.focusedOptionIndex + 1) % 5;
      return { shouldRender: true, done: false, result: null };
    }

    // Space, Enter, Return, Up, Down toggle the focused option (matches 'space/enter toggle' hint)
    if (
      key.name === "up" ||
      key.name === "down" ||
      key.name === "space" ||
      key.name === "return" ||
      key.name === "enter"
    ) {
      toggleFocusedOption(state);
      return { shouldRender: true, done: false, result: null };
    }

    // Direct single-letter shortcuts when in options focus mode:
    if (key.sequence === "f" || key.sequence === "F") {
      state.exportOptions.format = cycleFormat(state.exportOptions.format);
      state.focusedOptionIndex = 0;
      return { shouldRender: true, done: false, result: null };
    }

    if (key.sequence === "m" || key.sequence === "M") {
      state.exportOptions.mode = cycleMode(state.exportOptions.mode);
      state.focusedOptionIndex = 1;
      return { shouldRender: true, done: false, result: null };
    }

    if (key.sequence === "r" || key.sequence === "R") {
      state.exportOptions.redact = !state.exportOptions.redact;
      state.focusedOptionIndex = 2;
      return { shouldRender: true, done: false, result: null };
    }

    if (key.sequence === "t" || key.sequence === "T") {
      state.exportOptions.includeTools = !state.exportOptions.includeTools;
      state.focusedOptionIndex = 3;
      return { shouldRender: true, done: false, result: null };
    }

    if (key.sequence === "d" || key.sequence === "D") {
      state.exportOptions.includeDiffs = !state.exportOptions.includeDiffs;
      state.focusedOptionIndex = 4;
      return { shouldRender: true, done: false, result: null };
    }

    if (key.sequence === "o" || key.sequence === "O") {
      state.optionsFocus = false;
      return { shouldRender: true, done: false, result: null };
    }

    return { shouldRender: false, done: false, result: null };
  }

  // 6. Normal conversation list navigation & export selection (when optionsFocus is false)
  // Enter or Return to export selection
  if (key.name === "return" || key.name === "enter") {
    if (state.filteredList.length > 0 && state.selectedIndex >= 0 && state.selectedIndex < state.filteredList.length) {
      const conv = state.filteredList[state.selectedIndex];
      const result: PickerResult = {
        ...conv,
        conversation: conv,
        options: { ...state.exportOptions }
      };
      return { shouldRender: false, done: true, result };
    }
    return { shouldRender: false, done: true, result: null };
  }

  // 7. Normal conversation list navigation & search query typing (when optionsFocus is false)
  if (key.name === "up") {
    if (state.filteredList.length > 0) {
      state.selectedIndex = (state.selectedIndex - 1 + state.filteredList.length) % state.filteredList.length;
      return { shouldRender: true, done: false, result: null };
    }
    return { shouldRender: false, done: false, result: null };
  }

  if (key.name === "down") {
    if (state.filteredList.length > 0) {
      state.selectedIndex = (state.selectedIndex + 1) % state.filteredList.length;
      return { shouldRender: true, done: false, result: null };
    }
    return { shouldRender: false, done: false, result: null };
  }

  if (key.name === "pageup") {
    if (state.filteredList.length > 0) {
      state.selectedIndex = Math.max(0, state.selectedIndex - 5);
      return { shouldRender: true, done: false, result: null };
    }
    return { shouldRender: false, done: false, result: null };
  }

  if (key.name === "pagedown") {
    if (state.filteredList.length > 0) {
      state.selectedIndex = Math.min(state.filteredList.length - 1, state.selectedIndex + 5);
      return { shouldRender: true, done: false, result: null };
    }
    return { shouldRender: false, done: false, result: null };
  }

  if (key.name === "home") {
    if (state.filteredList.length > 0) {
      state.selectedIndex = 0;
      return { shouldRender: true, done: false, result: null };
    }
    return { shouldRender: false, done: false, result: null };
  }

  if (key.name === "end") {
    if (state.filteredList.length > 0) {
      state.selectedIndex = state.filteredList.length - 1;
      return { shouldRender: true, done: false, result: null };
    }
    return { shouldRender: false, done: false, result: null };
  }

  // Ctrl+U clears query
  if (key.ctrl && key.name === "u") {
    state.searchQuery = "";
    state.filteredList = filterConversations(conversations, state.searchQuery, options.isAll);
    state.selectedIndex = 0;
    return { shouldRender: true, done: false, result: null };
  }

  // Backspace
  if (key.name === "backspace") {
    if (state.searchQuery.length > 0) {
      state.searchQuery = state.searchQuery.slice(0, -1);
      state.filteredList = filterConversations(conversations, state.searchQuery, options.isAll);
      state.selectedIndex = 0;
      return { shouldRender: true, done: false, result: null };
    }
    return { shouldRender: false, done: false, result: null };
  }

  // Typing characters (printable chars only, excluding tabs or control keys)
  if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta && key.name !== "tab" && key.sequence >= " ") {
    state.searchQuery += key.sequence;
    state.filteredList = filterConversations(conversations, state.searchQuery, options.isAll);
    state.selectedIndex = 0;
    return { shouldRender: true, done: false, result: null };
  }

  return { shouldRender: false, done: false, result: null };
}

/**
 * Renders an interactive, searchable terminal picker for selecting a conversation.
 * Handles arrow navigation, real-time query filtering, Enter to select, and Esc/Ctrl+C to quit.
 */
export async function runConversationPicker(
  conversations: ConversationSummary[],
  options: PickerOptions
): Promise<PickerResult | null> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive picker requires an interactive TTY terminal. Use --latest or specify an ID.");
  }

  const exportOptions: PickerExportOptions = {
    format: options.exportOptions?.format || "jsonl",
    mode: options.exportOptions?.mode || "full",
    redact: Boolean(options.exportOptions?.redact),
    includeTools: options.exportOptions?.includeTools !== undefined ? options.exportOptions.includeTools : true,
    includeDiffs: options.exportOptions?.includeDiffs !== undefined ? options.exportOptions.includeDiffs : true,
    redactPaths: Boolean(options.exportOptions?.redactPaths)
  };

  const state: PickerState = {
    searchQuery: "",
    selectedIndex: 0,
    filteredList: filterConversations(conversations, "", options.isAll),
    exportOptions,
    optionsFocus: Boolean(options.optionsFocus),
    focusedOptionIndex: options.focusedOptionIndex || 0
  };

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
    const currentOptions: PickerOptions = {
      ...options,
      exportOptions: state.exportOptions,
      optionsFocus: state.optionsFocus,
      focusedOptionIndex: state.focusedOptionIndex
    };
    const lines = buildPickerLines(state.filteredList, currentOptions, state.searchQuery, state.selectedIndex, cols, rows);

    readline.cursorTo(process.stdout, 0, 0);
    process.stdout.write(lines.map((l) => l + "\x1b[K").join("\r\n") + "\r\n\x1b[J");
  }

  render();

  return new Promise<PickerResult | null>((resolve) => {
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

      const action = handlePickerKeypress(state, key, conversations, options);
      if (action.done) {
        cleanup();
        resolve(action.result);
        return;
      }
      if (action.shouldRender) {
        render();
      }
    }

    process.stdin.on("keypress", onKeypress);
  });
}

export function filterConversations(
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

  const exportOptions: PickerExportOptions = {
    format: options.exportOptions?.format || "jsonl",
    mode: options.exportOptions?.mode || "full",
    redact: Boolean(options.exportOptions?.redact),
    includeTools: options.exportOptions?.includeTools !== undefined ? options.exportOptions.includeTools : true,
    includeDiffs: options.exportOptions?.includeDiffs !== undefined ? options.exportOptions.includeDiffs : true,
    redactPaths: Boolean(options.exportOptions?.redactPaths)
  };
  const optionsFocus = Boolean(options.optionsFocus);
  const focusedOptionIndex = options.focusedOptionIndex || 0;

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

  let footer = "";
  if (optionsFocus) {
    footer = "  ←→ select   space/enter toggle   f/m/r/t/d set   esc done";
    if (maxLineWidth < 65) {
      footer = "  ←→ select   space toggle   f/m/r/t/d   esc done";
    }
    if (maxLineWidth < 50) {
      footer = "  ←→ move   space toggle   esc done";
    }
    if (maxLineWidth < 35) {
      footer = "  ←→ space esc";
    }
  } else {
    footer = options.isAll
      ? "  ↑↓ nav   type search   enter export   tab workspace   ^O opt   esc quit"
      : "  ↑↓ nav   type search   enter export   tab all   ^O opt   esc quit";
    if (maxLineWidth < 75) {
      footer = options.isAll
        ? "  ↑↓ nav   enter export   tab ws   ^O opt   esc quit"
        : "  ↑↓ nav   enter export   tab all   ^O opt   esc quit";
    }
    if (maxLineWidth < 60) {
      footer = options.isAll
        ? "  ↑↓ nav   enter ok   tab ws   esc quit"
        : "  ↑↓ nav   enter ok   tab all   esc quit";
    }
    if (maxLineWidth < 45) {
      footer = "  ↑↓ nav  enter ok  tab all  esc quit";
    }
    if (maxLineWidth < 30) {
      footer = "  ↑↓  enter  tab  esc";
    }
  }

  let hints = "";
  if (!optionsFocus && safeRows >= 16 && !isMinimal && !isCompact) {
    hints = "  ^F format   ^E mode   ^R redact   ^T tools   ^D diffs   ^O options";
    if (maxLineWidth < 70) {
      hints = "  ^F fmt   ^E mode   ^R red   ^T tls   ^D dif   ^O opt";
    }
    if (maxLineWidth < 50) {
      hints = "  ^F fmt  ^E mode  ^R red  ^T tls  ^D dif";
    }
  }

  const headerLinesCount = lines.length;
  let bottomOverhead = 1;
  if (isMinimal) {
    bottomOverhead = optionsFocus ? 2 : 1;
  } else if (isCompact) {
    bottomOverhead = 3;
  } else {
    bottomOverhead = hints ? 6 : 5;
  }

  const totalOverhead = headerLinesCount + bottomOverhead;
  const maxAllowedItems = Math.max(1, safeRows - totalOverhead);
  const PAGE_SIZE = Math.max(1, Math.min(8, maxAllowedItems));

  const maxStartIndex = Math.max(0, filteredList.length - PAGE_SIZE);
  const startIndex = Math.max(0, Math.min(selectedIndex - Math.floor(PAGE_SIZE / 2), maxStartIndex));
  const visibleItems = filteredList.slice(startIndex, startIndex + PAGE_SIZE);

  if (filteredList.length === 0) {
    lines.push(truncate("    No conversations match your search.", maxLineWidth));
    if (!isCompact && !isMinimal) lines.push("");
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
    if (!isCompact && !isMinimal) lines.push("");
  }

  if (!isMinimal) {
    lines.push(`  ${filteredList.length} conversation${filteredList.length === 1 ? "" : "s"}`);
    if (!isCompact) lines.push("");
  }

  if (!isMinimal || optionsFocus) {
    const optionsLine = formatOptionsBar(exportOptions, optionsFocus, focusedOptionIndex, maxLineWidth);
    lines.push(optionsLine);
  }

  lines.push(footer);

  if (hints) {
    lines.push(hints);
  }

  // Guarantee that every line is strictly within maxLineWidth and contains no newlines
  const clamped = lines.map((l) => (l.length > maxLineWidth ? l.slice(0, maxLineWidth) : l));
  if (clamped.length > safeRows) {
    return clamped.slice(0, safeRows);
  }
  return clamped;
}
