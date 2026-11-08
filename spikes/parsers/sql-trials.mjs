// T1.05b: run our lab SQL through each SQL parser candidate.
import { readdirSync, readFileSync } from 'node:fs';
import { loadModule, parseSync } from 'libpg-query';
import NodeSqlParser from 'node-sql-parser';

await loadModule();
const nsp = new NodeSqlParser.Parser();
const which = process.argv[2];

for (const file of readdirSync('sql').sort()) {
  const sql = readFileSync(`sql/${file}`, 'utf8');
  if (which === 'pg') {
    try {
      const r = parseSync(sql);
      const kinds = r.stmts.map((s) => {
        const [kind, body] = Object.entries(s.stmt)[0];
        const cmds = body.cmds ? '[' + body.cmds.map((c) => c.AlterTableCmd?.subtype).join(',') + ']' : '';
        return `${kind}${cmds}@${s.stmt_location ?? 0}+${s.stmt_len ?? '…'}`;
      });
      console.log(`${file}: OK v${r.version} ${r.stmts.length} stmts: ${kinds.join(' | ')}`);
    } catch (e) {
      console.log(`${file}: ERROR ${e.constructor.name} "${e.message}" cursor=${e.sqlDetails?.cursorPosition ?? '?'}`);
    }
  } else {
    try {
      const ast = nsp.astify(sql, { database: 'postgresql' });
      console.log(`${file}: OK ${Array.isArray(ast) ? ast.length : 1} stmts`);
    } catch (e) {
      console.log(`${file}: ERROR ${String(e.message).split('\n')[0].slice(0, 110)}`);
    }
  }
}
