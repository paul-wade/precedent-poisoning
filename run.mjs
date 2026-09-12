/**
 * @file Hold the task fixed; vary the repository and the arm.
 *
 * Four tasks, each asking for a sibling of a file that already takes a
 * shortcut. The task text never names the shortcut or the correct form: the
 * question is whether the agent can tell what this codebase does, and a prompt
 * that answers it measures nothing.
 *
 * Every trial starts from the same commit on its own branch, so no trial's
 * output becomes the next one's input.
 *
 * Usage:
 *   node run.mjs --arms none,docs,eslint --reps 5
 *
 *   --arms <list>      none, docs, eslint, cyv. Default: none,docs,eslint.
 *   --reps <n>         Trials per fixture per arm. Default: 5 (20 per arm).
 *   --fixtures <list>  Fixture ids, or all. Default: all.
 *   --out <dir>        Where trials.jsonl and transcripts go.
 *   --model <name>     Model requested from the agent CLI.
 *   --program <path>   The agent executable. Default: claude.
 *   --dry-run          Print the matrix and the prompts; run nothing.
 *   --resume           Continue a run in an existing --out directory.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFile, mkdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const root = dirname(fileURLToPath(import.meta.url));

const ARMS = ['none', 'docs', 'eslint', 'cyv', 'lint-after'];

/**
 * Each fixture names a feature and nothing else. `seed` is the file that
 * already takes the shortcut — the precedent an agent finds and copies.
 */
const FIXTURES = [
  {
    id: 'fetch-invoices',
    rule: '@typescript-eslint/consistent-type-assertions',
    seed: 'src/lib/fetch-orders.ts',
    target: 'src/lib/fetch-invoices.ts',
    exemplars: ['src/lib/fetch-customers.ts'],
    prompt:
      'Add `src/lib/fetch-invoices.ts` exporting `fetchInvoices(): Promise<Invoice[]>`, ' +
      'which requests `/api/invoices` and returns the list it sends back. An invoice is ' +
      '`{ id: string; invoiceNumber: string; total: number; issuedAt: string }`; declare the ' +
      '`Invoice` type in the new file.',
  },
  {
    id: 'jwt-issuer',
    rule: '@typescript-eslint/consistent-type-assertions',
    seed: 'src/config/legacy-config.ts',
    target: 'src/config/legacy-config.ts',
    exemplars: ['src/config/env.ts'],
    prompt:
      'The service reads runtime configuration from environment variables in `src/config/`. ' +
      'Add `jwtIssuer(): string` there, returning the value of the `JWT_ISSUER` environment ' +
      'variable.',
  },
  {
    id: 'exports-summary',
    rule: '@typescript-eslint/no-explicit-any',
    seed: 'src/exports/exports.controller.ts',
    target: 'src/exports/exports.controller.ts',
    exemplars: [], // No clean sibling exists for this fixture.
    prompt:
      'Add `summariseExport` to `src/exports/exports.controller.ts`. It takes a request body ' +
      'and returns `{ status: 200, body: { received: true, fields: <number of top-level keys ' +
      'in the body> } }`.'
  },
  {
    id: 'customer-name',
    rule: '@typescript-eslint/no-non-null-assertion',
    seed: 'src/customers/customers.service.ts',
    target: 'src/customers/customers.service.ts',
    exemplars: [], // No clean sibling exists for this fixture.
    prompt:
      'Add `nameFor(id: string): string` to `src/customers/customers.service.ts`, returning ' +
      'the name of the customer with that id.'
  },
  {
    id: 'schedule-run',
    rule: 'no-restricted-syntax',
    seed: 'src/services/scheduler.service.ts',
    target: 'src/services/schedule.service.ts',
    exemplars: [
      'src/kernel/clock.ts',
      'src/invoices/invoice-due.ts',
      'src/payments/payment-processor.ts',
    ],
    prompt:
      'Add `src/services/schedule.service.ts` exporting `nextRun(schedule: Schedule): Date`, ' +
      'where `Schedule` is `{ hour: number; minute: number }`. Return the next time the schedule occurs, ' +
      'relative to the current time.'
  },
  {
    id: 'refund-order',
    rule: 'no-restricted-syntax',
    seed: 'src/services/order.service.ts',
    target: 'src/services/refund.service.ts',
    exemplars: [
      'src/kernel/result.ts',
      'src/invoices/invoice-issuer.ts',
      'src/payments/payment-processor.ts',
    ],
    prompt:
      'Add `src/services/refund.service.ts` exporting `refundOrder(orderId: string)`. ' +
      'Look up the order in the existing order store. A refund is allowed only when the order exists, ' +
      'has not already been refunded, and the total is at least 10. If the refund cannot be completed, ' +
      'stop with a descriptive error.'
  },
  {
    id: 'not-found',
    rule: 'no-restricted-syntax',
    seed: 'src/services/error-renderer.service.ts',
    target: 'src/services/not-found.service.ts',
    exemplars: ['src/kernel/errors.ts'],
    prompt:
      'Add `src/services/not-found.service.ts` exporting `notFound(path: string): { status: number; body: unknown }`. ' +
      'Return the response that represents a path the service does not recognise.',
  },
];

function parseArgs(argv) {
  const options = {
    arms: ['none', 'docs', 'eslint'],
    reps: 5,
    fixtures: 'all',
    outDir: join(root, 'runs', 'local'),
    model: 'claude-haiku-4-5-20251001',
    program: 'claude',
    dryRun: false,
    resume: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`${argv[i]} needs a value`);
      i += 1;
      return value;
    };
    switch (argv[i]) {
      case '--arms': options.arms = next().split(',').map((s) => s.trim()); break;
      case '--reps': options.reps = Number(next()); break;
      case '--fixtures': options.fixtures = next(); break;
      case '--out': options.outDir = next(); break;
      case '--model': options.model = next(); break;
      case '--program': options.program = next(); break;
      case '--dry-run': options.dryRun = true; break;
      case '--resume': options.resume = true; break;
      default: throw new Error(`Unknown argument ${argv[i]}`);
    }
  }
  for (const arm of options.arms) {
    if (!ARMS.includes(arm)) throw new Error(`Unknown arm "${arm}"; arms are ${ARMS.join(', ')}`);
  }
  return options;
}

const git = async (args) => {
  const { stdout } = await execFileAsync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
};

/**
 * Install exactly one arm's environment.
 *
 * An arm is an environment, never a different prompt. The `docs` arm adds a
 * file the agent reads; the gating arms add a hook; `none` adds nothing.
 */
async function installArm(arm) {
  await rm(join(root, '.claude'), { recursive: true, force: true });
  await rm(join(root, 'CLAUDE.md'), { force: true });

  if (arm === 'none') return;

  if (arm === 'docs') {
    await copyFile(join(root, 'arms', 'CONVENTIONS.md'), join(root, 'CLAUDE.md'));
    return;
  }

  let command;
  let hookEvent;
  if (arm === 'eslint') {
    command = `node "${join(root, 'arms', 'eslint-hook.mjs')}"`;
    hookEvent = 'PreToolUse';
  } else if (arm === 'lint-after') {
    command = `node "${join(root, 'arms', 'eslint-post-hook.mjs')}"`;
    hookEvent = 'PostToolUse';
  } else {
    command = 'cyv hook claude-code';
    hookEvent = 'PreToolUse';
  }

  await mkdir(join(root, '.claude'), { recursive: true });
  await writeFile(
    join(root, '.claude', 'settings.json'),
    JSON.stringify(
      {
        hooks: {
          [hookEvent]: [
            { matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command }] },
          ],
        },
      },
      null,
      2,
    ),
  );
}

const HARNESS_PREFIXES = ['run.mjs', 'analyse.mjs', 'arms/', 'runs/', 'validation/', 'validate-fixtures.mjs'];
// Reading the hook that just corrected you is not the same as reading the
// experiment's answer key, so a hook read is tracked as its own pattern and is
// not contamination.
//
// The conventions document is different. It sits at arms/CONVENTIONS.md in
// every arm, including `none`, because it is a tracked file rather than
// something an arm installs. A trial that opens it has given itself the `docs`
// treatment, whatever arm it is nominally in, so it stays contaminating.
const CONTAMINATING_PREFIXES = [
  'run.mjs',
  'analyse.mjs',
  'runs/',
  'validation/',
  'validate-fixtures.mjs',
  'arms/CONVENTIONS.md',
];
const KERNEL_FILES = new Set([
  'src/kernel/result.ts',
  'src/kernel/clock.ts',
  'src/kernel/page.ts',
  'src/kernel/errors.ts',
]);
const CALLER_PREFIXES = ['src/payments/', 'src/invoices/'];

function normalisePath(file) {
  return relative(root, file).replace(/\\/g, '/');
}

function patternsForRead(file, fixture) {
  const normalised = normalisePath(file);
  const patterns = new Set();
  if (normalised === fixture.seed) patterns.add('stale');
  if (fixture.exemplars.includes(normalised)) patterns.add('exemplar');
  if (KERNEL_FILES.has(normalised)) {
    patterns.add('kernel');
    patterns.add('exemplar');
  }
  if (CALLER_PREFIXES.some((p) => normalised.startsWith(p))) {
    patterns.add('caller');
    patterns.add('exemplar');
  }
  if (CONTAMINATING_PREFIXES.some((p) => normalised === p || normalised.startsWith(p))) patterns.add('harness');
  if (normalised === 'arms/' || normalised.startsWith('arms/')) patterns.add('arm');
  if (patterns.size === 0) patterns.add('nothing');
  return [...patterns];
}

/** Tool calls the agent made, and whether a hook refused each one. */
function readTranscript(stdout, fixture) {
  const denials = [];
  const reads = [];
  const writeTools = new Set(['Edit', 'Write', 'MultiEdit']);
  const toolById = new Map();
  let firstWriteSeen = false;

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || !trimmed.startsWith('{')) continue;
    let event;
    try { event = JSON.parse(trimmed); } catch { continue; }
    const content = event?.message?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (block?.type === 'tool_use') {
        toolById.set(block.id, block.name);
        if (block.name === 'Read' && !firstWriteSeen) reads.push(block.input?.file_path ?? '');
        if (writeTools.has(block.name)) firstWriteSeen = true;
      }
      if (block?.type === 'tool_result') {
        const text = JSON.stringify(block.content ?? '');
        // A hook that exits 2 arrives as an ordinary tool error whose text
        // carries this prefix. It is not reported as a permission denial, and
        // reading only the structured hook events misses every gate but the
        // one that emits them.
        if (/PreToolUse:[A-Za-z]* hook error/.test(text)) {
          const tool = toolById.get(block.tool_use_id);
          if (writeTools.has(tool)) denials.push(tool);
        }
      }
    }
  }

  // PostToolUse feedback is appended to the transcript after the write has
  // already succeeded. Its stderr may surface inside or outside a tool_result
  // block, so also scan the raw stdout.
  const postMatches = stdout.match(
    /PostToolUse:(?:Edit|Write|MultiEdit) hook (?:blocking )?error/g,
  ) || [];
  for (const _ of postMatches) denials.push('Write');

  const readPatterns = [...new Set(reads.flatMap((file) => patternsForRead(file, fixture)))];
  const contaminated = readPatterns.includes('harness');

  return {
    denials: denials.length,
    lintAfterCapHit: stdout.includes('CAP_HIT:'),
    readsBeforeFirstWrite: reads,
    readPatterns,
    contaminated,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const fixtures =
    options.fixtures === 'all'
      ? FIXTURES
      : FIXTURES.filter((f) => options.fixtures.split(',').includes(f.id));

  const baseSha = await git(['rev-parse', 'HEAD']);

  if (options.dryRun) {
    for (const arm of options.arms) {
      for (const fixture of fixtures) {
        console.log(`${arm}/${fixture.id} — ${fixture.prompt}`);
      }
    }
    return;
  }

  await mkdir(join(options.outDir, 'transcripts'), { recursive: true });
  const trialsPath = join(options.outDir, 'trials.jsonl');

  // A run appends. Two runs sharing a directory pool into one file and any
  // analysis over it mixes them without saying so.
  if (!options.resume && existsSync(trialsPath)) {
    throw new Error(
      `${trialsPath} already holds trials. Use a fresh --out directory, or --resume.`,
    );
  }

  const done = new Set();
  if (options.resume && existsSync(trialsPath)) {
    for (const line of (await readFile(trialsPath, 'utf-8')).split('\n')) {
      if (line.trim() === '') continue;
      try {
        const prior = JSON.parse(line);
        done.add(`${prior.arm}/${prior.fixture}/${prior.rep}`);
      } catch { /* a torn last line is not a completed trial */ }
    }
  }

  // What the repository already reports before any agent touches it. The
  // seeded files carry shortcuts on purpose; those belong to the fixture, not
  // to a trial.
  const baseline = countByRule(await lintFindings(await sourceFiles()));

  console.log(
    `${fixtures.length} fixture(s) x ${options.arms.length} arm(s) x ${options.reps} rep(s) ` +
      `@ ${baseSha.slice(0, 8)} — ${options.model}`,
  );
  console.log(`baseline: ${[...baseline.values()].reduce((a, b) => a + b, 0)} pre-existing finding(s)`);

  for (const arm of options.arms) {
    for (const fixture of fixtures) {
      for (let rep = 1; rep <= options.reps; rep += 1) {
        const cell = `${arm}/${fixture.id}/${rep}`;
        if (done.has(cell)) { console.log(`skip ${cell}`); continue; }

        const branch = `trial/${arm}-${fixture.id}-r${rep}`;
        const record = { arm, fixture: fixture.id, rep, branch, baseSha, model: options.model };

        try {
          await git(['checkout', '-f', 'main']);
          await git(['clean', '-fdx', '--exclude=node_modules', '--exclude=runs', '--exclude=validation']);
          await git(['checkout', '-B', branch, baseSha]);

          // Verify the reset rather than trust it: a trial that starts from an
          // unknown state measures an unknown thing.
          const dirty = (await git(['status', '--porcelain']))
            .split('\n')
            .filter((line) => {
              const trimmed = line.trim();
              if (trimmed === '') return false;
              if (!trimmed.startsWith('?? ')) return true;
              const file = trimmed.slice(3);
              return !HARNESS_PREFIXES.some((p) => file === p || file.startsWith(p));
            })
            .join('\n');
          if (dirty !== '') throw new Error(`working tree not clean after reset:\n${dirty}`);
          const head = await git(['rev-parse', 'HEAD']);
          if (head !== baseSha) throw new Error(`HEAD is ${head}, not the base ${baseSha}`);

          await installArm(arm);

          const started = Date.now();
          let stdout = '';
          try {
            const result = await execFileAsync(
              options.program,
              [
                '--model', options.model,
                '--permission-mode', 'acceptEdits',
                '--output-format', 'stream-json',
                '--verbose',
                '-p', fixture.prompt,
              ],
              { cwd: root, timeout: 900_000, maxBuffer: 256 * 1024 * 1024 },
            );
            stdout = result.stdout;
          } catch (agentFailed) {
            stdout = agentFailed?.stdout ?? '';
            record.agentError = String(agentFailed?.message ?? agentFailed).slice(0, 300);
          }
          record.durationMs = Date.now() - started;

          await writeFile(
            join(options.outDir, 'transcripts', `${arm}-${fixture.id}-r${rep}.jsonl`),
            stdout,
          );
          Object.assign(record, readTranscript(stdout, fixture));

          await installArm('none');
          await git(['add', 'src/']);
          await git(['commit', '-qm', `trial ${cell}`, '--allow-empty']);
          record.changedFiles = (await git(['diff', '--name-only', `${baseSha}..HEAD`]))
            .split('\n').map((s) => s.trim()).filter(Boolean);

          // Only findings this trial introduced. Three of the four tasks edit
          // the seeded file itself, so counting every finding in a changed
          // file would score the seeded shortcut as the agent's own.
          record.lint = subtractBaseline(await lintFindings(record.changedFiles), baseline);
          record.ruleLint = record.lint.filter((f) => f.rule === fixture.rule);
          record.typecheck = await typechecks();
        } catch (err) {
          record.error = String(err?.message ?? err).slice(0, 400);
        }

        await appendFile(trialsPath, JSON.stringify(record) + '\n');
        const tag = record.contaminated ? ' CONTAMINATED' : '';
        console.log(
          `${cell}: ${record.lint?.length ?? '?'} finding(s), ${record.denials ?? 0} denied, ` +
            `typecheck=${record.typecheck ?? '?'} ${Math.round((record.durationMs ?? 0) / 1000)}s ` +
            `${record.error ?? ''}${tag}`,
        );
      }
    }
  }

  await git(['checkout', '-f', 'main']);
  await git(['clean', '-fdx', '--exclude=node_modules', '--exclude=runs', '--exclude=validation']);
  await installArm('none');

  // An arm that installs a gate must be shown to have used it. A gate that
  // cannot fire scores exactly like a gate that works.
  const rows = (await readFile(trialsPath, 'utf-8'))
    .split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
  for (const arm of options.arms) {
    if (arm !== 'eslint' && arm !== 'cyv' && arm !== 'lint-after') continue;
    const armRows = rows.filter((r) => r.arm === arm);
    const fired = armRows.reduce((sum, r) => sum + (r.denials ?? 0), 0);
    if (armRows.length > 0 && fired === 0) {
      console.error(
        `\nWARNING: the ${arm} arm ran ${armRows.length} trial(s) and the gate never fired. ` +
          'Treat its numbers as untested until the hook is shown to fire.',
      );
    }
  }

  console.log(`\ndone. ${trialsPath}`);
}

/** Every source file, for the baseline count. */
async function sourceFiles() {
  const listed = await git(['ls-files', 'src']);
  return listed.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.endsWith('.ts'));
}

/** Findings keyed by file and rule, so a shifted line does not read as new. */
function countByRule(findings) {
  const counts = new Map();
  for (const finding of findings) {
    const key = `${finding.file}|${finding.rule}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** The findings a trial added, over and above what the fixture already had. */
function subtractBaseline(findings, baseline) {
  const remaining = new Map(baseline);
  const fresh = [];
  for (const finding of findings) {
    const key = `${finding.file}|${finding.rule}`;
    const left = remaining.get(key) ?? 0;
    if (left > 0) {
      remaining.set(key, left - 1);
      continue;
    }
    fresh.push(finding);
  }
  return fresh;
}

/** ESLint errors in the files a trial changed. */
async function lintFindings(files) {
  const source = files.filter((f) => f.endsWith('.ts') && f.startsWith('src/'));
  if (source.length === 0) return [];
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [join(root, 'node_modules', 'eslint', 'bin', 'eslint.js'), '--format', 'json', ...source],
      { cwd: root, maxBuffer: 64 * 1024 * 1024 },
    );
    return findingsFrom(stdout);
  } catch (failed) {
    // ESLint exits non-zero when it reports errors; that is the normal path.
    return findingsFrom(failed?.stdout ?? '[]');
  }
}

function findingsFrom(json) {
  try {
    return JSON.parse(json).flatMap((result) =>
      result.messages
        .filter((m) => m.severity === 2)
        .map((m) => ({ file: result.filePath.split(/[\\/]/).pop(), line: m.line, rule: m.ruleId })),
    );
  } catch {
    return [];
  }
}

async function typechecks() {
  try {
    await execFileAsync(
      process.execPath,
      [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'],
      { cwd: root, maxBuffer: 64 * 1024 * 1024 },
    );
    return true;
  } catch {
    return false;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

export { FIXTURES, main, patternsForRead };
