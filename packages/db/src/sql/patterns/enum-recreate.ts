import type { Change, ChangeOfKind, SourcedChange, UsedSet } from '@rollbackgate/core';

// ADR-0006: Prisma removes an enum value by recreating the type. This recognizer replaces that exact
// sequence with one RemoveEnumValue per removed value; anything else is left untouched (fail-closed).

/** Replaces every exact enum recreate sequence in one migration's changes. */
export function recognizeEnumRecreate(
  changes: readonly SourcedChange[],
  usedSet: UsedSet,
): SourcedChange[] {
  const result: SourcedChange[] = [];
  let i = 0;
  while (i < changes.length) {
    const match = matchAt(changes, i);
    if (match === null) {
      const current = changes[i];
      if (current !== undefined) result.push(current);
      i += 1;
      continue;
    }
    result.push(...removedValues(match, usedSet));
    i = match.end;
  }
  return result;
}

interface Match {
  readonly enumName: string;
  readonly newValues: readonly string[];
  readonly source: SourcedChange['source'];
  /** Index just after the sequence. */
  readonly end: number;
}

function matchAt(changes: readonly SourcedChange[], start: number): Match | null {
  const at = (i: number): Change | undefined => changes[i]?.change;
  const create = at(start);
  if (create?.kind !== 'CreateEnum' || !create.enumName.endsWith('_new')) return null;
  const enumName = create.enumName.slice(0, -'_new'.length);
  const temp = create.enumName;

  // Converted columns: an optional DROP DEFAULT, then the type change with USING.
  let i = start + 1;
  const droppedDefaults: string[] = [];
  let converted = 0;
  for (;;) {
    const change = at(i);
    if (change?.kind === 'DropDefault') {
      const next = at(i + 1);
      if (
        !isConversion(next, temp) ||
        next.table !== change.table ||
        next.column !== change.column
      ) {
        return null;
      }
      droppedDefaults.push(key(change));
      i += 2;
      converted += 1;
    } else if (isConversion(change, temp)) {
      i += 1;
      converted += 1;
    } else {
      break;
    }
  }
  if (converted === 0) return null;

  const old = `${enumName}_old`;
  const [renameOld, renameNew, drop] = [at(i), at(i + 1), at(i + 2)];
  if (renameOld?.kind !== 'RenameEnum' || renameOld.from !== enumName || renameOld.to !== old)
    return null;
  if (renameNew?.kind !== 'RenameEnum' || renameNew.from !== temp || renameNew.to !== enumName)
    return null;
  if (drop?.kind !== 'DropEnum' || drop.enumName !== old) return null;
  i += 3;

  // Every dropped default must be restored, and nothing else may follow as part of the sequence.
  for (const column of droppedDefaults) {
    const restore = at(i);
    if (restore?.kind !== 'SetDefault' || key(restore) !== column) return null;
    i += 1;
  }
  const source = changes[start]?.source;
  return source === undefined ? null : { enumName, newValues: create.values, source, end: i };
}

function isConversion(
  change: Change | undefined,
  temp: string,
): change is ChangeOfKind<'AlterColumnType'> {
  return (
    change?.kind === 'AlterColumnType' &&
    change.hasUsing &&
    (change.toType === temp || change.toType === `${temp}[]`)
  );
}

function key(change: { readonly table: string; readonly column: string }): string {
  return `${change.table}.${change.column}`;
}

// If base doesn't use the enum, no used column has its type, so the recreate can't affect base.
function removedValues(match: Match, usedSet: UsedSet): SourcedChange[] {
  const base = usedSet.enums.get(match.enumName);
  if (base === undefined) return [];
  return base.values
    .filter((value) => !match.newValues.includes(value))
    .map((value) => ({
      change: { kind: 'RemoveEnumValue', enumName: match.enumName, value },
      source: match.source,
    }));
}
