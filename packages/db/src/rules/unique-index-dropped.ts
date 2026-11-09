import type { Rule } from '@rollbackgate/core';

/**
 * RG-DB-023 (RULES.md §4): a unique index or primary key base relies on is dropped. RISKY: Prisma's
 * `upsert` is `INSERT … ON CONFLICT` on those columns and needs the index (§6 row 6), so base's
 * upserts on them fail; reads and plain writes keep working. `DROP INDEX` carries only the name.
 */
export const uniqueIndexDroppedRule: Rule<'DropIndex' | 'DropConstraint'> = {
  id: 'RG-DB-023',
  appliesTo: ['DropIndex', 'DropConstraint'],
  evaluate(change, { usedSet }) {
    const index = usedSet.uniqueIndexes.get(change.name);
    if (index === undefined) return [];
    if (change.kind === 'DropConstraint' && change.table !== index.table) return [];
    const model = usedSet.tables.get(index.table)?.model ?? index.table;
    const columns = index.columns.map((c) => `"${c}"`).join(', ');
    return [
      {
        severity: 'RISKY',
        target: `"${change.name}"`,
        reason: `Base's upserts on model ${model} by (${columns}) fail without this index: P2039, "there is no unique or exclusion constraint matching the ON CONFLICT specification".`,
        fix: 'Remove the unique attribute from the schema and stop using upsert on those fields in one release, then drop the index one release later.',
      },
    ];
  },
};
