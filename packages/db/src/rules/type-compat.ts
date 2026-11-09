// The known widenings (RULES.md §4, "Types"): a short, explicit list. Types are spelled as in the used
// set and the normalizer (`int4`, `varchar(50)`); anything not covered is unknown, which the rules
// treat as UNSAFE (fail-closed).

export type TypeChange = 'same' | 'widening' | 'narrowing' | 'unknown';

interface ParsedType {
  readonly name: string;
  readonly args: readonly number[];
}

// smallint → integer → bigint, and real → double precision: a higher rank holds every lower value.
const ranks: readonly (readonly string[])[] = [
  ['int2', 'int4', 'int8'],
  ['float4', 'float8'],
];

/** How a column type change relates base's values to head's type. */
export function classifyTypeChange(from: string, to: string): TypeChange {
  if (from === to) return 'same';
  const a = parseType(from);
  const b = parseType(to);
  if (a === null || b === null) return 'unknown';
  const forward = widens(a, b);
  if (forward) return 'widening';
  return widens(b, a) ? 'narrowing' : 'unknown';
}

function widens(from: ParsedType, to: ParsedType): boolean {
  // varchar(n) → varchar(m) with m > n, and varchar(n) → text.
  if (from.name === 'varchar' && from.args.length === 1) {
    if (to.name === 'text' && to.args.length === 0) return true;
    return to.name === 'varchar' && to.args.length === 1 && arg(to, 0) > arg(from, 0);
  }
  // numeric(p,s) → numeric(p',s) with p' > p: more digits before the point, same after it.
  if (
    from.name === 'numeric' &&
    to.name === 'numeric' &&
    from.args.length === 2 &&
    to.args.length === 2
  ) {
    return arg(to, 1) === arg(from, 1) && arg(to, 0) > arg(from, 0);
  }
  // timestamp(p) → timestamp(p') with p' > p.
  if (
    from.name === 'timestamp' &&
    to.name === 'timestamp' &&
    from.args.length === 1 &&
    to.args.length === 1
  ) {
    return arg(to, 0) > arg(from, 0);
  }
  if (from.args.length > 0 || to.args.length > 0) return false;
  return ranks.some((rank) => {
    const i = rank.indexOf(from.name);
    const j = rank.indexOf(to.name);
    return i !== -1 && j !== -1 && j > i;
  });
}

function arg(type: ParsedType, index: number): number {
  return type.args[index] ?? Number.NaN;
}

// `varchar(50)` → { name: 'varchar', args: [50] }. Arrays and qualified names don't match: unknown.
function parseType(type: string): ParsedType | null {
  const match = /^([a-z0-9_]+)(?:\((\d+)(?:,(\d+))?\))?$/.exec(type);
  if (match === null) return null;
  const args = [match[2], match[3]].flatMap((v) => (v === undefined ? [] : [Number(v)]));
  return { name: match[1] ?? '', args };
}

// What each Prisma scalar can hold without losing values. Int is a 32-bit integer; Prisma reads a
// bigint into an Int field as a JS number, exact only up to 2^53 (RULES.md §6 row 3). DateTime is a
// JS Date, precise to the millisecond, so timestamp precision above 3 is lost.
const scalarCovers: Readonly<Record<string, (type: ParsedType) => boolean>> = {
  Int: (t) => t.name === 'int2' || t.name === 'int4',
  BigInt: (t) => ['int2', 'int4', 'int8'].includes(t.name),
  Float: (t) => t.name === 'float4' || t.name === 'float8',
  Decimal: (t) => t.name === 'numeric',
  String: (t) => t.name === 'varchar' || t.name === 'text',
  DateTime: (t) => t.name === 'timestamp' && arg(t, 0) <= 3,
};

/** Whether base's Prisma scalar still represents every value of the new column type. */
export function scalarCoversType(prismaType: string, type: string): boolean {
  const parsed = parseType(type);
  const covers = scalarCovers[prismaType];
  return parsed !== null && covers !== undefined && covers(parsed);
}
