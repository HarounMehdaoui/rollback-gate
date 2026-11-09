# Code conventions

Goal: a reviewer can open any file and understand it in under a minute.

## TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- No `any`. Use `unknown` and narrow it. No `as` casts on external data; validate it instead.
- Prefer `type` for unions, `interface` for object shapes that other code implements (`Rule`).
- Use `readonly` on domain types; pure functions don't mutate their inputs.
- ESM only, named exports only, no default exports.
- No non-null assertion `!` unless a comment on the line before says why it is safe (it needs an
  `eslint-disable-next-line` anyway, so that's where the reason goes).
- Discriminated unions for kinds (`Change`, `FindingSource`). Every `switch` over a kind is exhaustive
  and ends with `default: return assertNever(x)`, so adding a kind is a compile error until every
  switch handles it.
- Library APIs (libpg-query, the Prisma schema parser, cosign, Kyverno): check the installed
  version's types or docs before using them. Don't code from memory.

## Naming

| Thing | Style | Example |
|---|---|---|
| Files | kebab-case | `drop-column.ts` |
| Types / interfaces | PascalCase | `UsedSet`, `Finding` |
| Functions / variables | camelCase, verb first for functions | `buildUsedSet`, `computeVerdict` |
| Constants | camelCase (UPPER_CASE only for true env-level constants) | `defaultRules` |
| Rule IDs | `RG-<AREA>-<NNN>` | `RG-DB-001`, `RG-CFG-001`, `RG-RH-001` |
| Booleans | `is/has/can` prefix | `isNullable`, `hasDefault` |

Use domain words from the [glossary](GLOSSARY.md) consistently: *base*, *head*, *snapshot*,
*change*, *finding*, *verdict*, *used set*. Don't invent synonyms.

## Functions

- One job per function. If the name needs "and", split it.
- ~30 lines or 3 levels of nesting means it's time to extract something.
- Return early instead of nesting `if`s.
- Max 3 positional parameters; beyond that, pass an object.

## Errors

- **Expected problems are data, not exceptions.** Bad SQL → `Unparsable` change → UNSAFE finding.
  Parsers return `{ ok: true, value } | { ok: false, error }`.
- Throw only for programmer errors and broken invariants.
- The CLI catches everything at the top, prints a clear message, and exits with code `2` (tool error).
  Exit codes: `0` = SAFE or RISKY, `1` = UNSAFE, `2` = tool error.

## Rules (the analyzer kind)

Each rule file exports one `Rule` object. Its ID, severity, reason and fix come from
[RULES.md](RULES.md), which is the source of truth:

```ts
export const dropColumnRule: Rule = {
  id: 'RG-DB-002',
  appliesTo: ['DropColumn'],
  evaluate(change, ctx) { /* … */ },
};
```

Each `reason` says what breaks in the *previous release*. Each `fix` is a concrete next action.
Rules emit only `RISKY` or `UNSAFE` findings. When a change doesn't hurt base, the rule returns `[]`.

## Comments

- Explain *why* and point to the spec: `// See ADR-0002: the rehearsal can only raise severity.`
- No commented-out code. Git remembers.
- TSDoc on every exported function of `core` and `db`.

## Tests

- Vitest. Test files sit next to the code (`x.ts` → `x.test.ts`).
- Test names read like spec lines: `it('emits no finding when the dropped column is @ignore')`,
  `it('flags a dropped used column as UNSAFE')`.
- Arrange / Act / Assert with blank lines between them.
- Every rule: at least one positive (emits a finding) and one negative (emits no finding) unit test,
  plus one scenario folder.
- Test files are type-checked: they are part of each package's `tsc -b` build, so a type error in a
  test fails `pnpm build` (Vitest alone strips types without checking them). This is what makes
  `@ts-expect-error` tests (for example, exhaustive `switch`) meaningful. Vitest's own typecheck mode
  was rejected: it would be a second, separately configured checker.
- Bugs get a failing test first, then the fix.

## Formatting and linting

Prettier decides formatting (no debates) for code, JSON and YAML. Markdown is hand-formatted and
excluded in `.prettierignore`, because Prettier would re-pad every docs table. ESLint (type-aware)
enforces:
- purity and dependency direction, per package: `no-restricted-imports`, `no-restricted-globals`,
  `no-restricted-properties` (details in [ARCHITECTURE.md §2](ARCHITECTURE.md#2-packages-pnpm-workspaces))
- `@typescript-eslint/no-explicit-any`, `@typescript-eslint/switch-exhaustiveness-check`
