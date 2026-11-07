# ADR-0001: Authoritative check runs at release time against the deployed base

- **Status:** accepted
- **Date:** 2026-11-07

## Context
The verdict is attached to an image digest, but `check` originally ran per PR against the last
release tag. An image built from `main` can contain several merged PRs that are each SAFE alone and
UNSAFE together (PR A makes `name` nullable, PR B stops writing it). Also, the last tag is not always
what's running (skipped releases, hotfixes, staging/prod drift).

## Options considered
1. **PR check only, base = last tag.** Simple, but the verdict doesn't describe the deployed image.
2. **Release-time check, base = deployed digest.** Matches what actually gets rolled back to; needs a
   way to map digest → commit.
3. **Both.** PR check for early feedback, release check as the source of truth.

## Decision
Option 3. PR mode is advisory (CI still fails on UNSAFE). Release mode resolves the base from the
digest running in the target environment, mapped to its commit through OCI labels
(`org.opencontainers.image.revision`) or build provenance, and that verdict is the one attested.
The predicate records `base.digest` and `base.commit`.

## Consequences
- Release pipeline needs read access to the target environment (or a recorded "current release").
- The deploy step must check `predicate.base.digest == running digest`; a mismatch means a stale verdict.
- Images must carry the revision label (Phase 3 CI task).

## How to defend it
"A PR isn't what you deploy, an image is. So the verdict that gates the deploy is computed for that
image, against the image it would roll back to."
