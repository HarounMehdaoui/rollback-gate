import { getDMMF } from '@prisma/get-dmmf';
const cases = {
  empty: '',
  noDatasource: 'model A {\n  id Int @id\n}\n',
  multiFile: [['a.prisma', 'datasource db {\n  provider = "postgresql"\n}\n'], ['b.prisma', 'model B {\n  id Int @id\n}\n']],
};
for (const [name, datamodel] of Object.entries(cases)) {
  try { const r = getDMMF({ datamodel }); console.log(name, 'error' in r ? `-> error value (${r.type})` : `-> ok, models: ${r.datamodel.models.map((m) => m.name).join(',') || 'none'}`); }
  catch (e) { console.log(name, '-> THROWS', e.constructor.name); }
}
