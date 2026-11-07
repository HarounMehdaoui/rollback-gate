# Glossary

Use these words, with these meanings, in code, docs and commit messages. Don't invent synonyms
(for example, don't say "old/new", "source/target" or "previous/current" in code; say base/head).

| Term | Meaning |
|---|---|
| **base** | The release we would roll back *to*: the one running now. In PR mode it is the last release tag. In release mode it is the commit of the image actually deployed. |
| **head** | The candidate release being checked: the one we are about to deploy. |
| **snapshot** | Everything the pure analyzers need about one release, loaded by the CLI: `ref`, raw `schema.prisma` text, migration files (`name`, `sql`, `sha256`) in apply order, and later the env contract. Base and head each have one. |
| **used set** | What base's code can touch in the database: tables, columns and enums from base's `schema.prisma`, minus `@ignore`/`@@ignore`, with `@map`/`@@map` resolved to real database names, and each column's type, nullability, default and enum. The type lives in `core`; `db` builds it. See [RULES.md §2](RULES.md#2-what-used-by-base-means). |
| **change** | One normalized effect of a migration statement, such as `DropColumn` or `AddEnumValue`. A discriminated union (`Change`) in `core`. Rules only ever see changes, never raw SQL or the AST. |
| **finding** | One problem a rule found: `ruleId`, `severity` (`RISKY` or `UNSAFE` only), `target`, `reason`, `fix`, `source`. |
| **source** | Where a finding comes from: a statement in a migration, a whole migration, or the release as a whole (config, rehearsal). |
| **verdict** | The answer for a release: `SAFE`, `RISKY` or `UNSAFE`. It is the worst finding's severity, or `SAFE` when there are no findings. |
| **rule** | One check with a stable ID (`RG-DB-002`), the `Change` kinds it applies to, a severity, a reason and a fix. One rule per file. Catalogue: [RULES.md](RULES.md). |
| **analyzer** | A pure function `(base: Snapshot, head: Snapshot) => Finding[]` for one area. `analyzeDb` in `packages/db` is the Phase 1 analyzer; `packages/config` adds one in Phase 2. |
| **fail-closed** | When the tool can't understand something, it reports a problem instead of saying SAFE: unparsable SQL → UNSAFE, unknown type change → UNSAFE, unrecognized statement → RISKY. |
| **backfill** | An `UPDATE` that fills a column added in the same release. It produces no finding, because base doesn't use that column (RG-DB-018). |
| **rehearsal** | (Phase 2) A real run: temp Postgres, base migrations then head migrations, head boots and writes data, then base boots with head's config and runs its smoke test. It can only *add* findings (RG-RH-001). See [ADR-0002](adr/0002-rehearsal-write-then-read-raise-only.md). |
| **attestation** | (Phase 4) A signed in-toto statement saying "this verdict belongs to this image digest", made with keyless cosign. See [ADR-0003](adr/0003-keyless-signing.md). |
| **predicate** | The content of the attestation: verdict, base digest and commit, head commit, findings, rehearsal status, override, tool version. Predicate type `https://rollbackgate.dev/verdict/v1`. |
| **override** | A human decision to deploy an UNSAFE release anyway. It needs the PR label `rollback-unsafe-approved` and a non-empty "Rollback plan" section, and it is recorded in the predicate's `override` field. |
| **PR mode** | `check` run on a pull request against the last release tag. Advisory: early feedback, and CI still fails on UNSAFE. |
| **release mode** | `check` run when building a release, against the image actually deployed (digest → commit). Authoritative: this is the verdict that gets attested. See [ADR-0001](adr/0001-release-mode-against-deployed-base.md). |
| **expand / contract** | Making a breaking schema change over several releases. *Expand*: add the new structure next to the old one. *Switch* code to it. *Retire* the old one. *Contract*: remove the old structure once no rollback target uses it. Example: [RULES.md §5](RULES.md#5-worked-example-renaming-username-to-userfullname-in-four-releases). |
