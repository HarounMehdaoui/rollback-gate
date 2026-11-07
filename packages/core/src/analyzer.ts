import type { Finding } from './finding.js';
import type { Snapshot } from './snapshot.js';

/**
 * A pure analyzer for one area (ARCHITECTURE.md §10, rule 2): base and head in, findings out.
 * It needs base to know what the rollback target uses, and returns findings, not a verdict, so
 * several analyzers (db, config) can be combined before the verdict engine runs.
 */
export type Analyzer = (base: Snapshot, head: Snapshot) => readonly Finding[];
