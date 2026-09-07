# Security Policy

## Reporting Security Issues

We take the security and privacy of `agy-export` very seriously. If you find a security vulnerability, please report it privately rather than opening a public issue.

Contact the maintainers via security advisory on GitHub or email.

## Privacy & Local Operation Guarantees

- **Zero Telemetry**: `agy-export` contains zero analytics, tracking, or network telemetry.
- **Localhost Loopback Only**: The tool communicates only with the local Antigravity language server daemon on `127.0.0.1`. It never transmits conversation content, credentials, or metadata over external networks.
- **Hidden Reasoning Protection**: Internal reasoning blocks, model chain-of-thought, and unconfirmed internal data are strictly filtered and omitted by design.
- **Secret Redaction**: When `--redact` is enabled, common credentials (GitHub tokens, AWS keys, OpenAI keys, Bearer tokens, private keys) are sanitized prior to export.
