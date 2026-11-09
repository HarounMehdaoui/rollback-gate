import { describe, expect, it } from 'vitest';

import { classifyTypeChange, scalarCoversType } from './type-compat.js';

describe('classifyTypeChange', () => {
  it.each([
    ['varchar(50)', 'varchar(255)'],
    ['varchar(50)', 'text'],
    ['int2', 'int4'],
    ['int4', 'int8'],
    ['int2', 'int8'],
    ['float4', 'float8'],
    ['numeric(10,2)', 'numeric(12,2)'],
    ['timestamp(3)', 'timestamp(6)'],
  ])('treats %s → %s as a widening and the reverse as a narrowing', (from, to) => {
    expect(classifyTypeChange(from, to)).toBe('widening');
    expect(classifyTypeChange(to, from)).toBe('narrowing');
  });

  it('treats an unchanged type as the same', () => {
    expect(classifyTypeChange('varchar(50)', 'varchar(50)')).toBe('same');
  });

  it.each([
    ['text', 'int4'],
    ['int4', 'float8'],
    ['numeric(10,2)', 'numeric(12,4)'],
    ['timestamp(3)', 'timestamptz(3)'],
    ['text[]', 'varchar(50)[]'],
    ['Role', 'Role_new'],
    ['varchar', 'text'],
  ])('treats %s → %s as unknown (not in the list)', (from, to) => {
    expect(classifyTypeChange(from, to)).toBe('unknown');
  });
});

describe('scalarCoversType', () => {
  it.each([
    ['Int', 'int4', true],
    ['Int', 'int8', false],
    ['BigInt', 'int8', true],
    ['Float', 'float8', true],
    ['String', 'text', true],
    ['Decimal', 'numeric(12,2)', true],
    ['DateTime', 'timestamp(3)', true],
    ['DateTime', 'timestamp(6)', false],
    ['Json', 'jsonb', false],
  ])('%s covers %s: %s', (scalar, type, covers) => {
    expect(scalarCoversType(scalar, type)).toBe(covers);
  });
});
