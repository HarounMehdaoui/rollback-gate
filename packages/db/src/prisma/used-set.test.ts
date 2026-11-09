import type { UsedSet } from '@rollbackgate/core';
import { describe, expect, it } from 'vitest';

import { buildUsedSet } from './used-set.js';

const datasource = 'datasource db {\n  provider = "postgresql"\n}\n';

function usedSetOf(models: string): UsedSet {
  const result = buildUsedSet(datasource + models);
  if (!result.ok) throw new Error(result.error);
  return result.usedSet;
}

// The T1.05b parser-trial schema: every case the used set needs, checked against Prisma 7.10.1's
// own DDL for it. If a Prisma upgrade changes a field we read, this test fails first.
const trialSchema = `
enum Role {
  USER
  ADMIN  @map("admin_role")

  @@map("user_role")
}

model User {
  id        Int      @id(map: "users_pk") @default(autoincrement())
  email     String   @unique
  handle    String   @unique(map: "users_handle_uq")
  fullName  String   @map("full_name") @db.VarChar(255)
  role      Role     @default(USER)
  createdAt DateTime @default(now())
  status    String   @default("draft")
  token     String   @default(dbgenerated("gen_random_uuid()::text"))
  legacy    String?  @ignore
  posts     Post[]

  @@unique([fullName, role])
  @@index([createdAt])
  @@map("users")
}

model Post {
  id       Int  @id @default(autoincrement())
  authorId Int  @map("author_id")
  author   User @relation(fields: [authorId], references: [id])
}

model AuditLog {
  id Int @id

  @@ignore
}
`;

describe('buildUsedSet on the parser-trial schema', () => {
  const usedSet = usedSetOf(trialSchema);

  it('keys tables by database name and leaves out @@ignore models', () => {
    expect([...usedSet.tables.keys()]).toEqual(['users', 'Post']);
    expect(usedSet.tables.get('users')?.model).toBe('User');
  });

  it('keys columns by database name, without @ignore or relation fields', () => {
    expect([...(usedSet.tables.get('users')?.columns.keys() ?? [])]).toEqual([
      'id',
      'email',
      'handle',
      'full_name',
      'role',
      'createdAt',
      'status',
      'token',
    ]);
    expect([...(usedSet.tables.get('Post')?.columns.keys() ?? [])]).toEqual(['id', 'author_id']);
  });

  it('records each column’s Prisma type, native type, optionality and list flag', () => {
    expect(usedSet.tables.get('users')?.columns.get('full_name')).toEqual({
      field: 'fullName',
      prismaType: 'String',
      nativeType: 'varchar(255)',
      isOptional: false,
      isList: false,
    });
    expect(usedSet.tables.get('users')?.columns.get('email')?.nativeType).toBe('text');
  });

  it('records the enum of an enum column by database name', () => {
    expect(usedSet.tables.get('users')?.columns.get('role')).toMatchObject({
      prismaType: 'Role',
      nativeType: 'user_role',
      enumName: 'user_role',
      default: 'USER',
    });
  });

  it('renders defaults back to schema syntax', () => {
    const column = (name: string) => usedSet.tables.get('users')?.columns.get(name)?.default;

    expect(column('id')).toBe('autoincrement()');
    expect(column('createdAt')).toBe('now()');
    expect(column('status')).toBe('"draft"');
    expect(column('token')).toBe('dbgenerated("gen_random_uuid()::text")');
    expect(column('email')).toBeUndefined();
  });

  it('keys enums and their values by database name', () => {
    expect(usedSet.enums).toEqual(new Map([['user_role', { values: ['USER', 'admin_role'] }]]));
  });

  it('records unique indexes and primary keys by the name Prisma gives them', () => {
    expect(usedSet.uniqueIndexes).toEqual(
      new Map([
        ['users_pk', { table: 'users', columns: ['id'], isPrimaryKey: true }],
        ['users_email_key', { table: 'users', columns: ['email'], isPrimaryKey: false }],
        ['users_handle_uq', { table: 'users', columns: ['handle'], isPrimaryKey: false }],
        [
          'users_full_name_role_key',
          { table: 'users', columns: ['full_name', 'role'], isPrimaryKey: false },
        ],
        ['Post_pkey', { table: 'Post', columns: ['id'], isPrimaryKey: true }],
      ]),
    );
  });
});

describe('buildUsedSet', () => {
  it('records optional and list columns', () => {
    const columns = usedSetOf(
      'model T {\n  id Int @id\n  note String?\n  tags String[]\n}\n',
    ).tables.get('T')?.columns;

    expect(columns?.get('note')).toMatchObject({ isOptional: true, isList: false });
    expect(columns?.get('tags')).toMatchObject({ isList: true, nativeType: 'text[]' });
  });

  it('renders numbers, booleans, lists and function arguments', () => {
    const columns = usedSetOf(
      'model T {\n  id String @id @default(uuid())\n  n Int @default(5)\n  b Boolean @default(true)\n' +
        '  l String[] @default([])\n  u DateTime @updatedAt\n}\n',
    ).tables.get('T')?.columns;

    expect(columns?.get('id')?.default).toBe('uuid(4)');
    expect(columns?.get('n')?.default).toBe('5');
    expect(columns?.get('b')?.default).toBe('true');
    expect(columns?.get('l')?.default).toBe('[]');
    // @updatedAt is set by Prisma on every write; it isn't a @default.
    expect(columns?.get('u')?.default).toBeUndefined();
  });

  it('leaves out an enum that only an @ignore field uses', () => {
    const usedSet = usedSetOf(
      'enum Old {\n  A\n}\nmodel T {\n  id Int @id\n  old Old? @ignore\n}\n',
    );

    expect(usedSet.enums.size).toBe(0);
  });

  it('leaves out the indexes of @@ignore models', () => {
    const usedSet = usedSetOf(
      'model T {\n  id Int @id\n}\nmodel Gone {\n  id Int @id\n  e String @unique\n  @@ignore\n}\n',
    );

    expect([...usedSet.uniqueIndexes.keys()]).toEqual(['T_pkey']);
  });

  it('names a compound primary key <table>_pkey and ignores plain indexes', () => {
    const usedSet = usedSetOf(
      'model T {\n  a Int\n  b Int\n  c Int\n  @@id([a, b])\n  @@index([c])\n  @@map("t")\n}\n',
    );

    expect(usedSet.uniqueIndexes).toEqual(
      new Map([['t_pkey', { table: 't', columns: ['a', 'b'], isPrimaryKey: true }]]),
    );
  });

  it('cuts a default index name past 63 characters exactly as Prisma does', () => {
    const usedSet = usedSetOf(
      'model AVeryLongModelNameForTestingIdentifierLimits {\n  id Int @id\n' +
        '  anotherQuiteLongColumnNameThatGoesOnAndOn String @unique\n}\n',
    );

    expect(
      usedSet.uniqueIndexes.has('AVeryLongModelNameForTestingIdentifierLimits_anotherQuiteLo_key'),
    ).toBe(true);
  });

  it('returns an error, not an empty used set, for a schema it cannot use', () => {
    const result = buildUsedSet('');

    expect(result).toEqual({ ok: false, error: 'the Prisma schema has no datasource' });
  });
});
