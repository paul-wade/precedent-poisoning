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
import { FIXTURES } from './run.mjs';

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

const ruleByFixture = new Map(FIXTURES.map((f) => [f.id, f.rule]));

/** Findings on this trial that match the fixture's declared rule. */
function ruleFindingsFor(row) {
  if (Array.isArray(row.ruleLint)) return row.ruleLint;
  const rule = ruleByFixture.get(row.fixture);
  return rule ? (row.lint ?? []).filter((f) => f.rule === rule) : [];
}

const cell = (subset) => {
  const n = subset.length;
  const violated = subset.filter((r) => (r.lint ?? []).length > 0).length;
  const ruleViolated = subset.filter((r) => ruleFindingsFor(r).length > 0).length;
  const denied = subset.filter((r) => (r.denials ?? 0) > 0).length;
  return { n, violated, ruleViolated, denied };
};

console.log(`\n${rows.length} trials from ${path}\n`);

console.log('| arm | n | declared-rule rate | any-finding rate | trials with a gate denial | typecheck failed |');
console.log('|---|---|---|---|---|---|');
for (const arm of arms) {
  const subset = rows.filter((r) => r.arm === arm);
  const { n, violated, ruleViolated, denied } = cell(subset);
  const broke = subset.filter((r) => r.typecheck === false).length;
  console.log(
    `| ${arm} | ${n} | ${ruleViolated} / ${n} | ${violated} / ${n} | ${denied} / ${n} | ${broke} |`,
  );
}

console.log('\nDeclared-rule rate per fixture\n');
const fixtureHeader = ['| fixture |', ...arms.map((a) => ` ${a} |`)].join('');
console.log(fixtureHeader);
console.log(['|---|', ...arms.map(() => '---|')].join(''));
for (const fixture of fixtures) {
  const cells = arms.map((arm) => {
    const { n, ruleViolated } = cell(rows.filter((r) => r.arm === arm && r.fixture === fixture));
    return ` ${ruleViolated} / ${n} |`;
  });
  console.log([`| ${fixture} |`, ...cells].join(''));
}

console.log('\nAny-finding rate per fixture\n');
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
const fmtDeclared = (s) => ' ' + s.padEnd(19);
const fmtAny = (s) => ' ' + s.padEnd(19);
const splitRow = (a, b, c, d, e) =>
  `|${fmtArm(a)}|${fmtRead(b)}|${fmtN(c)}|${fmtDeclared(d)}|${fmtAny(e)}|`;

console.log('\n' + splitRow('arm', 'read a compliant example', 'n', 'wrote declared rule', 'wrote any finding'));
console.log('|---|---|---|---|---|');
for (const arm of arms) {
  for (const readExemplar of [false, true]) {
    const subset = cleanRows.filter(
      (r) => r.arm === arm && r.readPatterns.includes('exemplar') === readExemplar,
    );
    const n = subset.length;
    const wroteDeclared = subset.filter((r) => ruleFindingsFor(r).length > 0).length;
    const wroteAny = subset.filter((r) => (r.lint ?? []).length > 0).length;
    const answer = readExemplar ? 'yes' : 'no';
    const wroteDeclaredStr = String(wroteDeclared).padStart(2, ' ') + ' / ' + n;
    const wroteAnyStr = String(wroteAny).padStart(2, ' ') + ' / ' + n;
    console.log(splitRow(arm, answer, n, wroteDeclaredStr, wroteAnyStr));
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
