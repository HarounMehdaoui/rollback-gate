import type { Finding } from './finding.js';
import type { Snapshot } from './snapshot.js';

/**
 * Base and head in, findings out. It returns findings rather than a verdict so the db and config
 * analyzers can be combined first.
 */
export type Analyzer = (base: Snapshot, head: Snapshot) => readonly Finding[];
