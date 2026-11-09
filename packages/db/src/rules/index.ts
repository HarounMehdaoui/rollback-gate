import type { Rule } from '@rollbackgate/core';

import { dropColumnRule } from './drop-column.js';
import { dropTableRule } from './drop-table.js';
import { editedMigrationRule } from './edited-migration.js';
import { renameColumnRule } from './rename-column.js';
import { renameTableRule } from './rename-table.js';
import { requiredColumnAddedRule } from './required-column-added.js';
import { unparsableSqlRule } from './unparsable-sql.js';
import { unrecognizedStatementRule } from './unrecognized-statement.js';

/** Every DB rule. Adding a rule means one file and one line here. */
export const dbRules: readonly Rule[] = [
  dropTableRule,
  dropColumnRule,
  renameTableRule,
  renameColumnRule,
  requiredColumnAddedRule,
  editedMigrationRule,
  unparsableSqlRule,
  unrecognizedStatementRule,
];
