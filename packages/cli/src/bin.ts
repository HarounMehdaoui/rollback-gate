#!/usr/bin/env node
// The executable. Everything testable lives in main.ts; this only connects it to the process.
import { main } from './main.js';

process.exitCode = await main(process.argv.slice(2), {
  cwd: process.cwd(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
