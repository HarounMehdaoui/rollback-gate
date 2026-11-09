import type { Rule } from '@rollbackgate/core';

import { dropColumnRule } from './drop-column.js';
import { dropDefaultRule } from './drop-default.js';
import { dropNotNullRule } from './drop-not-null.js';
import { dropTableRule } from './drop-table.js';
import { editedMigrationRule } from './edited-migration.js';
import { renameColumnRule } from './rename-column.js';
import { renameTableRule } from './rename-table.js';
import { requiredColumnAddedRule } from './required-column-added.js';
import { setNotNullRule } from './set-not-null.js';
import { typeNarrowingRule } from './type-narrowing.js';
import { typeWideningRule } from './type-widening.js';
import { unknownTypeChangeRule } from './unknown-type-change.js';
import { unparsableSqlRule } from './unparsable-sql.js';
import { unrecognizedStatementRule } from './unrecognized-statement.js';

/** Every DB rule. Adding a rule means one file and one line here. */
export const dbRules: readonly Rule[] = [
  dropTableRule,
  dropColumnRule,
  renameTableRule,
  renameColumnRule,
  requiredColumnAddedRule,
  typeNarrowingRule,
  typeWideningRule,
  unknownTypeChangeRule,
  setNotNullRule,
  dropNotNullRule,
  dropDefaultRule,
  editedMigrationRule,
  unparsableSqlRule,
  unrecognizedStatementRule,
];
