# Orbit Release Signing

This directory contains the Orbit Release public key and signing documentation.

## How to Generate the Release Key

If you are a maintainer setting up signing for the first time:

```bash
# Generate a new GPG key (non-interactive)
gpg --batch --gen-key <<EOF
Key-Type: RSA
Key-Length: 4096
Subkey-Type: RSA
Subkey-Length: 4096
Name-Real: Orbit Release Key
Name-Email: releases@orbit.chat
Expire-Date: 2y
%no-protection
EOF

# Export the public key
gpg --armor --export "Orbit Release Key" > security/public-key.asc

# Export the private key (store in GitHub Secrets as GPG_PRIVATE_KEY)
gpg --armor --export-secret-keys "Orbit Release Key" > private-key.asc
```

> ⚠️ **Never commit the private key.** Store it as a [GitHub Actions secret](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions).

## Adding the Key to GitHub Secrets

1. Go to your repository → Settings → Secrets and variables → Actions
2. Add `GPG_PRIVATE_KEY` with the content of `private-key.asc`
3. (Optional) Add `GPG_PASSPHRASE` if you used a passphrase

## Verifying a Release

```bash
# 1. Import the public key
gpg --import security/public-key.asc

# 2. Download release artifacts (SHA256SUMS.txt + SHA256SUMS.txt.sig + your file)

# 3. Verify the signature
gpg --verify SHA256SUMS.txt.sig SHA256SUMS.txt

# 4. Verify your downloaded file
sha256sum --check SHA256SUMS.txt --ignore-missing
```

## Key Fingerprint

Once generated, run:
```bash
gpg --fingerprint "Orbit Release Key"
```

And paste the fingerprint here after setup.
