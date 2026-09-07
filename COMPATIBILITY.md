# Compatibility Matrix

`agy-export` is verified against the following Google Antigravity environments and platforms:

## Supported Antigravity Versions

| Environment | Version | Status | Source Adapter | Notes |
|---|---|---|---|---|
| Antigravity CLI | `1.1.26` | ✓ Verified | `daemon`, `sidecar` | ConnectRPC over localhost HTTP |
| Antigravity CLI | `1.1.x` | ✓ Supported | `daemon`, `sidecar` | Local trajectory extraction |
| Antigravity IDE | `2.5.5` | ✓ Verified | `daemon`, `sidecar` | Local extension language server RPC |
| Antigravity IDE | `2.x` | ✓ Supported | `daemon`, `sidecar` | Local extension language server RPC |

## Supported Runtimes & Operating Systems

| OS / Runtime | Version | Status |
|---|---|---|
| Node.js | `>= 22.0.0` (tested on 22, 24) | ✓ Supported |
| Windows (Native / PowerShell) | Windows 10, 11, Server | ✓ First-class |
| macOS | Sonoma, Sequoia (arm64, x64) | ✓ First-class |
| Linux | Ubuntu 22.04, 24.04, Debian, Fedora | ✓ First-class |
| WSL2 | Ubuntu on Windows | ✓ Supported as Linux environment |
