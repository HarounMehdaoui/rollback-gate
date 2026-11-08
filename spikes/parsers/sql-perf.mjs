import { readFileSync } from 'node:fs';
import * as pg from 'libpg-query';
try { pg.parseSync('SELECT 1'); console.log('parseSync before loadModule: works'); } catch (e) { console.log('parseSync before loadModule: THROWS', e.message.slice(0, 90)); }
let t = performance.now(); await pg.loadModule(); console.log(`loadModule: ${(performance.now() - t).toFixed(1)} ms`);
const sql = readFileSync('sql/create-schema-and-tables.sql', 'utf8');
t = performance.now(); for (let i = 0; i < 1000; i++) pg.parseSync(sql); console.log(`parseSync x1000 (10-statement migration): ${(performance.now() - t).toFixed(0)} ms`);
await pg.loadModule(); console.log('loadModule twice: fine');
