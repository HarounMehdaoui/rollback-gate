# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- Project specification, architecture, roadmap, task plan and development workflow.
- Rules catalogue (`docs/RULES.md`): 22 DB rules, reserved config and rehearsal rules, severity and
  override policy, 4-release rename walkthrough.
- Glossary (`docs/GLOSSARY.md`).
- Monorepo bootstrap (T1.01): pnpm workspace with `core`, `db` and `cli`, TypeScript project
  references, Vitest, ESLint purity and dependency-direction rules, Prettier, and the `ci` workflow,
  with Node 26 and pnpm 12.18.0 pinned.

### Changed
- Git workflow: squash-only auto-merge, ruleset on `main` (PR + up-to-date `ci`, no bypass), no
  stacked PRs, small doc fixes ride along in the next task's PR.
- ADRs renumbered from 0010–0012 to 0001–0003.
- Phase 1 tasks reordered and split so every rule task ends with passing scenarios.
- Architecture types: full `Change` union, `UsedSet` in core, `Finding.source` union, `Analyzer` type.
- Severity principle: UNSAFE only when base will certainly break; RISKY when it breaks only for some
  values (RG-DB-006, 009, 016 lowered to RISKY).
- T1.05 becomes a Prisma behaviour lab that answers the open questions by experiment; Node 26 pinned.
