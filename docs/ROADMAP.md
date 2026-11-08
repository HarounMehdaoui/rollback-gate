# Roadmap

Each phase ends with a git tag and a short demo you could show a reviewer.

| Phase | Goal | Exit criteria (demo) | Tag |
|---|---|---|---|
| 1 | DB analyzer + verdict engine + `check` | `rollbackgate check` gives the right verdict on all 4 steps of the rename scenario (RULES.md §5) and on every rule's scenario | `v0.1.0` |
| 2 | Config contract + rehearsal | Removing a required env var → UNSAFE; rehearsal catches a dropped column that static analysis was told to ignore | `v0.2.0` |
| 3 | CI integration | GitHub Action posts the verdict as a PR comment and fails on UNSAFE; release-mode job resolves the deployed base | `v0.3.0` |
| 4 | Attestation | Verdict signed (keyless) on the image digest; `cosign verify-attestation` passes | `v0.4.0` |
| 5 | Enforcement | On kind: SAFE image admitted, UNSAFE refused, UNSAFE+override admitted, rollback to N-1 admitted; `verify-deploy` does the same on Docker | `v0.5.0` |
| 6 | Demo app + pilot | NestJS demo walks through the 4-release rename; used on at least one JE INSAT project | `v1.0.0` |

## Open decisions (each becomes an ADR)

- [ ] Prisma schema parser (`@mrleebo/prisma-ast` vs Prisma's internal `getDMMF` vs other) — Phase 1, T1.05b, ADR-0004
- [ ] SQL parser: libpg-query native vs WASM build, Postgres grammar version, CI impact — Phase 1, T1.05b, ADR-0005
- [ ] How multi-statement patterns (Prisma's enum recreate) are recognized — Phase 1, T1.20, ADR-0006
- [x] Severity principle: certain → UNSAFE, possible → RISKY (`docs/RULES.md` §3)
- [x] Answer the "verify" items in `docs/RULES.md` by experiment — T1.05a (Prisma 7.10.1, Postgres 18.6)
- [x] RG-DB-023 (unique index dropped that base upserts on): RISKY
- [x] RG-DB-011 on a nullable column: RISKY
- [ ] Can maintainers approve the override on their own PR? — before Phase 4
- [ ] How a PR's override (label + rollback plan) carries into the release-mode verdict, which covers
  several PRs — before Phase 4.
  *Owner's proposal:* an override covers **specific findings** (`ruleId` + `target` + migration), not
  a whole PR or release. A release verdict is UNSAFE unless **every** UNSAFE finding has an approved
  override from the PR that introduced it.
- [ ] License (MIT vs Apache-2.0) — before first public release

## Out of scope (on purpose)

API/OpenAPI contracts (oasdiff covers it), event/message contracts, infrastructure contracts,
migration lock safety (squawk covers it), databases other than Postgres, ORMs other than Prisma,
multi-release rollbacks.

## Ideas (not planned)

Add ideas here instead of building them.
