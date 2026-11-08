# Scenarios

Each folder is one end-to-end test case for the DB analyzer. A single test file
(`packages/cli/test/scenarios.test.ts`) discovers them, loads `base/` and `head/` into snapshots
with the cli's directory loader, and calls `analyzeDb(base, head)` directly (no git involved).
Folders whose name starts with `_` (like `_smoke`) are fixtures for the runner itself.

```text
scenarios/<kebab-case-name>/
  base/                  # previous release
    prisma/schema.prisma
    prisma/migrations/<timestamp>_<name>/migration.sql
  head/                  # candidate release (same layout)
  expected.json
```

`expected.json`:

```json
{
  "verdict": "UNSAFE",
  "findings": [
    { "ruleId": "RG-DB-002", "severity": "UNSAFE", "target": "\"User\".\"name\"" }
  ]
}
```

Only the fields listed are compared, so `reason` and `fix` wording can change without breaking tests.
`findings` lists only RISKY and UNSAFE findings (rules never emit SAFE ones), in the sorted order of
the verdict. A SAFE scenario has `"verdict": "SAFE", "findings": []`. Rule IDs come from
[docs/RULES.md](../docs/RULES.md).

Rules:
- One idea per scenario. The name says what it tests: `drop-ignored-column`, `enum-add-value`.
- Use real Prisma output for the SQL whenever possible (`_smoke` matches `prisma migrate dev` from
  Prisma 7.10.1 byte for byte).
- Schemas must be valid for Prisma 7: no `url` in the `datasource` block (it moved to
  `prisma.config.ts`; Prisma reports P1012 otherwise).
- Every rule has at least one scenario. Every fixed bug gets one.
