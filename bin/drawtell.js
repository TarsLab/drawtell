#!/usr/bin/env node
/**
 * drawtell — placeholder release (name reservation).
 * The real CLI is being designed at https://github.com/tarslab/drawtell.
 *
 * Even as a placeholder it follows the house rules for agent-friendly CLIs:
 * --json everywhere, semantic exit codes, errors that tell you what to do next.
 */

const VERSION = '0.0.1';
const HOMEPAGE = 'https://github.com/tarslab/drawtell';
const PLANNED = [
  ['build <scene.ts>', 'compile a TS scene into a self-contained lesson bundle'],
  ['check <scene.ts>', 'type/schema/layout checks with fix-it error messages'],
  ['snap <scene>', 'render keyframe screenshots for visual review'],
  ['serve', 'local web player + lesson library + LAN distribution'],
  ['ls', 'list local scenes and lesson bundles'],
];

const args = process.argv.slice(2);
const json = args.includes('--json');
const rest = args.filter((a) => a !== '--json');
const cmd = rest[0];

const status = {
  name: 'drawtell',
  version: VERSION,
  status: 'placeholder',
  message: `Name-reservation release; no commands are implemented yet. Watch ${HOMEPAGE} for progress.`,
  planned: PLANNED.map(([usage]) => usage.split(' ')[0]),
  homepage: HOMEPAGE,
};

if (cmd === undefined || cmd === '--help' || cmd === '-h') {
  if (json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log(`drawtell ${VERSION} — draw & tell: stroke-by-stroke chalkboard explanations.

  STATUS: placeholder release reserving the package name.
  Nothing is implemented yet. Progress: ${HOMEPAGE}

  Planned commands:
${PLANNED.map(([usage, desc]) => `    drawtell ${usage.padEnd(18)} ${desc}`).join('\n')}

  Flags: --help, --version, --json (machine-readable output)`);
  }
  process.exit(0);
}

if (cmd === '--version' || cmd === '-v') {
  console.log(json ? JSON.stringify({ name: 'drawtell', version: VERSION }) : VERSION);
  process.exit(0);
}

const known = PLANNED.some(([usage]) => usage.split(' ')[0] === cmd);
const error = {
  error: known ? 'not_implemented' : 'unknown_command',
  command: cmd,
  message: known
    ? `'drawtell ${cmd}' is planned but not implemented in this placeholder release (${VERSION}). Watch ${HOMEPAGE} for progress.`
    : `Unknown command '${cmd}'. Run 'drawtell --help' to see planned commands.`,
  homepage: HOMEPAGE,
};
console.error(json ? JSON.stringify(error, null, 2) : `drawtell: ${error.message}`);
process.exit(known ? 3 : 2);
