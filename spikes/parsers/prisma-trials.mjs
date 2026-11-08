// T1.05b: run test.prisma through each Prisma candidate and print the facts the used set needs.
import { readFileSync } from 'node:fs';
import { getSchema } from '@mrleebo/prisma-ast';
import { getDMMF as getDmmfStandalone } from '@prisma/get-dmmf';

const schema = readFileSync('test.prisma', 'utf8');
const broken = schema.replace('model Post {', 'model Post {\n  oops Strin');
const which = process.argv[2];

function summarizeDmmf(dmmf) {
  const dm = dmmf.datamodel;
  for (const m of dm.models) {
    console.log(`model ${m.name} dbName=${m.dbName} primaryKey=${JSON.stringify(m.primaryKey)}`);
    for (const f of m.fields) {
      console.log(`  ${f.name} kind=${f.kind} type=${f.type} dbName=${f.dbName ?? '-'} required=${f.isRequired} list=${f.isList} native=${JSON.stringify(f.nativeType ?? null)} default=${JSON.stringify(f.default ?? null)} unique=${f.isUnique} relationFrom=${JSON.stringify(f.relationFromFields ?? null)}`);
    }
    console.log(`  uniqueIndexes=${JSON.stringify(m.uniqueIndexes)} uniqueFields=${JSON.stringify(m.uniqueFields)}`);
  }
  for (const e of dm.enums) console.log(`enum ${e.name} dbName=${e.dbName} values=${JSON.stringify(e.values)}`);
  if (dm.indexes) console.log(`indexes=${JSON.stringify(dm.indexes.map((i) => ({ model: i.model, type: i.type, dbName: i.dbName, fields: i.fields.map((f) => f.name) })))}`);
}

if (which === 'ast') {
  const ast = getSchema(schema);
  const user = ast.list.find((b) => b.type === 'model' && b.name === 'User');
  console.log(JSON.stringify(user, null, 1).split('\n').slice(0, 60).join('\n'));
  try { getSchema(broken); console.log('broken schema: NO ERROR'); } catch (e) { console.log('broken schema throws:', e.constructor.name, String(e.message).slice(0, 160)); }
}
if (which === 'get-dmmf') {
  const r = getDmmfStandalone({ datamodel: schema });
  if ('error' in r) console.log('ERROR', r.reason); else summarizeDmmf(r);
  const b = getDmmfStandalone({ datamodel: broken });
  console.log('broken schema:', 'error' in b ? `returns error: type=${b.type} ${String(b.error?.message ?? b.reason).split('\n').find((l) => l.includes('error')) ?? ''}` : 'NO ERROR');
}
if (which === 'internals') {
  const mod = await import('@prisma/internals');
  const getDMMF = mod.getDMMF ?? mod.default.getDMMF;
  summarizeDmmf(await getDMMF({ datamodel: schema }));
  try { await getDMMF({ datamodel: broken }); console.log('broken: NO ERROR'); } catch (e) { console.log('broken schema throws:', e.name); }
}
