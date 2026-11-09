import type { Rule } from '@rollbackgate/core';

import { dropColumnRule } from './drop-column.js';
import { dropTableRule } from './drop-table.js';

/** Every DB rule. Adding a rule means one file and one line here. */
export const dbRules: readonly Rule[] = [dropTableRule, dropColumnRule];
