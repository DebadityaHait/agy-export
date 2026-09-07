# Contributing to agy-export

Thank you for your interest in improving `agy-export`!

## Development Setup

Requirements:
- Node.js 22+
- npm 10+

```bash
git clone https://github.com/agy-tools/agy-export.git
cd agy-export
npm install
```

## Running Verification

Before submitting changes, ensure all verification steps pass:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run pack:test
```

## Engineering Principles

1. **Read-Only Guarantee**: `agy-export` must never write to Antigravity's own data directories (`~/.gemini/antigravity-cli`, etc.). All tests must use fixtures and isolated temp directories.
2. **Deterministic Outputs**: Output filenames and compact-mode reductions must be fully deterministic. No non-deterministic models or cloud LLMs may be called.
3. **Privacy First**: Never allow hidden internal reasoning, scratchpads, or privileged system prompts to leak into exports.
