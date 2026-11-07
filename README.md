# Rollback Gate

> Most pipeline checks ask "will this deploy work?". Rollback Gate asks "will **undoing** it work?"

Rollback Gate is a CI/CD tool that checks every release for one property: **if this release goes
wrong, can we safely roll back to the previous one?** It answers `SAFE`, `RISKY` or `UNSAFE`, explains
each finding, suggests a fix, and can block deploys that would leave you with no way back.

**A personal project in early development.** Phase 1 (database analyzer) is in progress, and features
marked *planned* don't exist yet (see [Status](#status)). It isn't open to outside contributions yet.

## The problem

A rollback reverts your **code**, not your **database** or your **config**. If a release drops a column
or removes an env var, the previous version can crash on start or on its first query. Teams usually find
out during the incident, when rolling back is the only plan they have.

Existing tools cover nearby problems. Migration linters (squawk, Atlas lint, strong_migrations,
django-migration-linter) check whether a migration is safe to *run* or backward-compatible. oasdiff
checks API breaking changes. Rollback Gate focuses on a combination they don't cover:

- **Prisma-aware "used by the previous release" analysis** (`@ignore`, `@map`, `@@map` resolved)
- **Deployment config contracts** (env vars the previous release needs)
- **A rehearsal** that boots the previous image against the new schema, data and config
- **A signed verdict enforced at deploy time** (Kyverno, or a deploy-script check)

## Core assumption

During a rollback, code goes back **one release**. Schema, data and config stay as the new release left
them. So every release must stay compatible with the previous release's code.

## Verdicts

| Verdict | Meaning | CI | Deploy |
|---|---|---|---|
| `SAFE` | The previous release works with what this release leaves behind | pass | admitted |
| `RISKY` | Probably fine, but depends on data or code paths we can't fully check | pass + warning | admitted |
| `UNSAFE` | The previous release will break after a rollback | **fail** | refused, unless overridden* |

Exit codes of `check`: `0` = SAFE or RISKY, `1` = UNSAFE, `2` = tool error.

\* Override: the PR has the label `rollback-unsafe-approved` and a non-empty "Rollback plan" section;
the override is recorded in the signed verdict *(planned)*. Every rule, its severity and its fix are
listed in [docs/RULES.md](docs/RULES.md).

## How it works

1. **`rollbackgate check`** — static analysis of the release against the deployed base release.
2. **`rollbackgate rehearse`** *(planned)* — temp Postgres, apply migrations, run the new image to
   write data, then boot the previous image with the new config and run its smoke tests.
3. **`rollbackgate attest`** *(planned)* — sign the verdict as an in-toto attestation on the image digest
   (keyless cosign).
4. **Enforcement** *(planned)* — Kyverno `verifyImages` policy, or `rollbackgate verify-deploy` before
   `docker compose up`.

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Example

```text
$ rollbackgate check --base v1.4.0 --head HEAD

UNSAFE  RG-DB-002  Column "User"."name" is dropped but used by the previous release.
        Why:  The v1.4.0 Prisma client selects "name"; every User query fails after a rollback.
        Fix:  Retire the field first (@ignore, stop writing it), drop it one release later.

Verdict: UNSAFE (1 unsafe, 0 risky)
```

*(Output format is the Phase 1 target and may change.)*

## Development

Requires Node 26 (see `.nvmrc`) and pnpm 12.18.0 (pinned in `package.json`).

```bash
pnpm install
pnpm build          # type-checks and compiles every package, tests included
pnpm test           # builds, then runs Vitest
pnpm lint           # ESLint, incl. purity and dependency-direction rules
pnpm format         # Prettier
```

## Quick start *(available after Phase 1)*

```bash
pnpm install
pnpm build
pnpm rollbackgate check --base <last-release-tag> --head HEAD
```

## Status

| Phase | Scope | Status |
|---|---|---|
| 1 | DB analyzer, verdict engine, `check` command | 🚧 in progress |
| 2 | Config contract + rehearsal | planned |
| 3 | CI integration (GitHub Actions) | planned |
| 4 | Attestation (in-toto + cosign) | planned |
| 5 | Enforcement (Kyverno on kind, `verify-deploy`) | planned |
| 6 | Demo app + pilot | planned |

Task-level progress: [docs/TASKS.md](docs/TASKS.md).

## Known limits

- Raw SQL inside application code is invisible to static analysis (the rehearsal partly covers this).
- The rehearsal uses synthetic data and only covers the paths its smoke tests exercise.
- Only PostgreSQL + Prisma.
- Migration run-safety (locks, long rewrites) is out of scope — use squawk for that.
- On plain Docker hosts, enforcement depends on the deploy script calling `verify-deploy`.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) · [Rules](docs/RULES.md) · [Glossary](docs/GLOSSARY.md)
- [Roadmap](docs/ROADMAP.md) · [Tasks](docs/TASKS.md)
- [Conventions](docs/CONVENTIONS.md) · [Workflow](docs/WORKFLOW.md) · [Decisions (ADRs)](docs/adr/)

## Author

Haroun Mehdaoui ([@HarounMehdaoui](https://github.com/HarounMehdaoui)).

## License

Not chosen yet (tracked in [docs/ROADMAP.md](docs/ROADMAP.md)). Until a license is added, all rights
are reserved.
