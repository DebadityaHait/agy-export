# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-05

### Added
- Interactive searchable terminal picker with fuzzy/substring search.
- Deterministic JSONL, JSON, and Markdown export formats (`agy-export/v1` schema).
- Workspace scoping matching `process.cwd()` with `--all` flag for multi-workspace searches.
- Full, compact, and messages export modes with deterministic noise reduction.
- Secret and credential redaction (`--redact`) and workspace/home path redaction (`--redact-paths`).
- Unix composable `--stdout` support with diagnostics routed to stderr.
- Antigravity CLI and IDE local daemon discovery and trajectory RPC retrieval.
- Local trajectory sidecar fallback support.
- Actionable offline encrypted storage detection.
- Comprehensive `agy-export --doctor` command for local environment diagnostics.
- Cross-platform support for Windows, PowerShell, macOS, Linux, and WSL.
- Programmatic TypeScript API (`listConversations`, `exportConversation`, `readConversation`).
