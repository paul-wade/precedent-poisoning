/**
 * @file Turn a run's trials.jsonl into the table.
 *
 * Reported per fixture as well as pooled. Pooling alone hides a fixture that
 * every arm gets right, and a comparison resting on one discriminating fixture
 * looks stronger pooled than it is.
 *
 * Usage: node analyse.mjs [runs/<dir>]
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dir = process.argv[2] ?? join(root, 'runs', 'local');
const path = join(dir, 'trials.jsonl');

if (!existsSync(path)) {
  console.error(`No trials at ${path}. Run: node run.mjs`);
  process.exit(1);
}

const rows = readFileSync(path, 'utf-8')
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line));

const arms = [...new Set(rows.map((r) => r.arm))];
const fixtures = [...new Set(rows.map((r) => r.fixture))];

const cell = (subset) => {
  const n = subset.length;
  const violated = subset.filter((r) => (r.lint ?? []).length > 0).length;
  const denied = subset.filter((r) => (r.denials ?? 0) > 0).length;
  return { n, violated, denied };
};

console.log(`\n${rows.length} trials from ${path}\n`);

console.log('| arm | n | wrote the shortcut | trials with a gate denial | typecheck failed |');
console.log('|---|---|---|---|---|');
for (const arm of arms) {
  const subset = rows.filter((r) => r.arm === arm);
  const { n, violated, denied } = cell(subset);
  const broke = subset.filter((r) => r.typecheck === false).length;
  console.log(`| ${arm} | ${n} | ${violated} / ${n} | ${denied} / ${n} | ${broke} |`);
}

console.log('\nPer fixture — a fixture every arm gets right is not measuring anything.\n');
const fixtureHeader = ['| fixture |', ...arms.map((a) => ` ${a} |`)].join('');
console.log(fixtureHeader);
console.log(['|---|', ...arms.map(() => '---|')].join(''));
for (const fixture of fixtures) {
  const cells = arms.map((arm) => {
    const { n, violated } = cell(rows.filter((r) => r.arm === arm && r.fixture === fixture));
    return ` ${violated} / ${n} |`;
  });
  console.log([`| ${fixture} |`, ...cells].join(''));
}

const cleanRows = rows.filter((r) => !r.contaminated);
const contaminatedCount = rows.length - cleanRows.length;

const fmtArm = (s) => ' ' + s.padEnd(7);
const fmtRead = (s) => ' ' + s.padEnd(25);
const fmtN = (s) => ' ' + String(s).padStart(2, ' ') + ' ';
const fmtWrote = (s) => ' ' + s.padEnd(19);
const splitRow = (a, b, c, d) =>
  `|${fmtArm(a)}|${fmtRead(b)}|${fmtN(c)}|${fmtWrote(d)}|`;

console.log('\n' + splitRow('arm', 'read a compliant example', 'n', 'wrote the shortcut'));
console.log('|---|---|---|---|');
for (const arm of arms) {
  for (const readExemplar of [false, true]) {
    const subset = cleanRows.filter(
      (r) => r.arm === arm && r.readPatterns.includes('exemplar') === readExemplar,
    );
    const n = subset.length;
    const wrote = subset.filter((r) => (r.lint ?? []).length > 0).length;
    const answer = readExemplar ? 'yes' : 'no';
    const wroteStr = String(wrote).padStart(2, ' ') + ' / ' + n;
    console.log(splitRow(arm, answer, n, wroteStr));
  }
}
console.log(`\n${contaminatedCount} contaminated.`);

const errored = rows.filter((r) => r.error || r.agentError);
if (errored.length > 0) {
  console.log(`\n${errored.length} trial(s) reported an error:`);
  for (const row of errored.slice(0, 10)) {
    console.log(`  ${row.arm}/${row.fixture}/${row.rep}: ${row.error ?? row.agentError}`);
  }
}

for (const arm of arms) {
  if (arm !== 'eslint' && arm !== 'cyv') continue;
  const subset = rows.filter((r) => r.arm === arm);
  if (subset.length > 0 && subset.every((r) => (r.denials ?? 0) === 0)) {
    console.log(
      `\nWARNING: the ${arm} arm never denied a write. Its numbers are untested — ` +
        'a gate that cannot fire scores like a gate that works.',
    );
  }
}
