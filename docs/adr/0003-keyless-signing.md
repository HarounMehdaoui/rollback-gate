# ADR-0003: Keyless signing pinned to the release workflow identity

- **Status:** accepted
- **Date:** 2026-11-07

## Context
With a long-lived cosign key, whoever holds the key can sign any verdict, including a forged SAFE.

## Decision
Use keyless cosign (Sigstore, GitHub Actions OIDC). The Kyverno policy and `verify-deploy` accept only
attestations whose certificate identity is the release workflow on `main` of this repository and
whose issuer is GitHub's OIDC issuer.

## Consequences
- No key to store or rotate. Signatures are logged in the Rekor transparency log.
- Air-gapped or self-hosted setups need a key-based fallback (documented, not default).
- Trust moves to "who can change the release workflow on `main`", which branch protection controls.

## How to defend it
"Nobody holds a key. A verdict is only valid if our release workflow on protected `main` produced it,
and that is publicly logged."
