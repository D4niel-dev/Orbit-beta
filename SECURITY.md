# Security Policy

## Supported Versions

Orbit is in beta. Security fixes are issued for the **latest release and the one
immediately prior**. Anything older is not maintained.

| Version | Supported |
|---------|-----------|
| Latest release | ✅ |
| Previous release | ✅ |
| Anything older | ❌ |

See [CHANGELOG.md](CHANGELOG.md) for the current version.

## Reporting a Vulnerability

If you discover a security vulnerability in Orbit, please report it privately.

**Do not** open a public GitHub issue. Instead, email **orbit.support.real@gmail.com**

Please include the version, platform, and steps to reproduce if you can. If you
would like to encrypt your report, use the PGP key in [`security/`](security/).

You can expect an acknowledgement within 48 hours and a detailed response within 5 business days.

## Release Verification

All official Orbit releases include:
- `SHA256SUMS.txt` — checksums of every release artifact
- `SHA256SUMS.txt.sig` — GPG signature of the checksums file

See [security/README.md](security/README.md) for full verification instructions.
