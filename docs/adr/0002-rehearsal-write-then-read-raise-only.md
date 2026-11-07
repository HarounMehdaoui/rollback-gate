# ADR-0002: Rehearsal writes with the new release, reads with the old, and can only raise severity

- **Status:** accepted
- **Date:** 2026-11-07

## Context
Booting the previous image against migrated synthetic data proves little. Prisma doesn't check the
schema at startup (verify against the Prisma version in use), so the old image boots and passes its
healthcheck even with a dropped column. The dangerous data is what the **new** release writes (NULLs,
new enum values), and a plain rehearsal never creates it.

## Decision
Sequence: base migrations + seed → head migrations → **boot head, run head smoke (writes)** → stop →
**boot base with head config, run base healthcheck + smoke (reads and writes)**.
A failure adds an UNSAFE finding (`RG-RH-001`). A pass never lowers a static finding.
It's called "evidence", not "proof".

## Consequences
- Both releases need smoke scripts; coverage is limited to what they exercise.
- Rehearsal is slower; it runs in release mode and optionally in PR mode.

## How to defend it
"Static analysis can be wrong in both directions; the rehearsal can only catch what it exercises.
So a failure is trusted, and a pass is not treated as proof of safety."
