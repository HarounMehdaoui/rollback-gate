import { describe, expect, it } from 'vitest';

import { parsePrismaSchema } from './parse-schema.js';

const datasource = 'datasource db {\n  provider = "postgresql"\n}\n';
const model = 'model A {\n  id Int @id\n}\n';

function errorOf(schema: string): string {
  const result = parsePrismaSchema(schema);
  if (result.ok) throw new Error('expected an error');
  return result.error;
}

describe('parsePrismaSchema', () => {
  it('parses a minimal valid schema', () => {
    const result = parsePrismaSchema(datasource + model);

    expect(result.ok).toBe(true);
  });

  describe('fails closed', () => {
    it('rejects an invalid schema with Prisma’s message, without terminal colours', () => {
      const error = errorOf(`${datasource}model A {\n  id Int @id\n  oops Strin\n}\n`);

      expect(error).toMatch(/^invalid Prisma schema: /);
      expect(error).toContain('Type "Strin" is neither a built-in type');
      expect(error).not.toContain(String.fromCharCode(27));
    });

    it('rejects an empty schema (Prisma itself accepts it)', () => {
      expect(errorOf('')).toBe('the Prisma schema has no datasource');
    });

    it('rejects models without a datasource', () => {
      expect(errorOf(model)).toBe('the Prisma schema has no datasource');
    });

    it('rejects a datasource that is not PostgreSQL', () => {
      expect(errorOf(`datasource db {\n  provider = "mysql"\n}\n${model}`)).toContain(
        'unsupported datasource provider "mysql"',
      );
    });

    it('rejects a datasource with no models', () => {
      expect(errorOf(datasource)).toBe('the Prisma schema has no models');
    });

    it('rejects a schema whose only model is @@ignore', () => {
      expect(errorOf(`${datasource}model A {\n  id Int @id\n  @@ignore\n}\n`)).toBe(
        'the Prisma schema has no models',
      );
    });

    it('rejects a model outside the public schema', () => {
      const schema =
        'datasource db {\n  provider = "postgresql"\n  schemas = ["public", "auth"]\n}\n' +
        'model U {\n  id Int @id\n  @@schema("auth")\n}\n';

      expect(errorOf(schema)).toBe('model U is in schema "auth"; only "public" is supported');
    });
  });

  it('keeps only fields that have a column', () => {
    const result = parsePrismaSchema(
      `${datasource}model A {\n  id Int @id\n  bs B[]\n  shape Unsupported("circle")?\n}\n` +
        'model B {\n  id Int @id\n  aId Int\n  a A @relation(fields: [aId], references: [id])\n}\n',
    );
    if (!result.ok) throw new Error(result.error);

    expect(result.schema.models.map((m) => [m.name, m.fields.map((f) => f.name)])).toEqual([
      ['A', ['id']],
      ['B', ['id', 'aId']],
    ]);
  });
});
