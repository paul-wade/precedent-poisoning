#!/usr/bin/env node
/**
 * A PostToolUse lint feedback hook.
 *
 * The write has already landed, so the file on disk is the post-edit version.
 * We lint it, compare it against the version that existed just before this
 * edit, and report any new ESLint errors to the agent.  Findings are capped at
 * five per file per trial; when the cap is hit the remaining findings are
 * accepted and a marker is written so the runner can report it.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

let raw = '';
process.stdin.setEncoding('utf-8');
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const tool = input?.tool_name;
const toolInput = input?.tool_input ?? {};
const filePath = toolInput.file_path;
if (typeof filePath !== 'string' || !filePath.endsWith('.ts')) process.exit(0);

const absolute = isAbsolute(filePath) ? filePath : join(repoRoot, filePath);
const relativePath = relative(repoRoot, absolute).replace(/\\/g, '/');

if (!existsSync(absolute)) process.exit(0);

const normalise = (text) => text.replace(/\r\n/g, '\n');

const require_ = createRequire(join(repoRoot, 'package.json'));
// pathToFileURL: req.resolve returns an absolute path, and on Windows a drive
// letter is not a URL scheme, so a bare path throws here.
const { loadESLint } = await import(pathToFileURL(require_.resolve('eslint')).href);
const FlatESLint = await loadESLint({ useFlatConfig: true });
const eslint = new FlatESLint({ cwd: repoRoot });

const errorsIn = async (content) => {
  const results = await eslint.lintText(content, { filePath: absolute });
  return results.flatMap((result) =>
    result.messages
      .filter((message) => message.severity === 2)
      .map((message) => `  ${message.line}:${message.column} ${message.message} (${message.ruleId})`),
  );
};

const CAP = 5;
const CAP_MARKER = 'CAP_HIT';
const stateDir = join(repoRoot, '.claude');
const stateFile = join(stateDir, 'eslint-post-state.json');

function loadState() {
  try {
    return JSON.parse(readFileSync(stateFile, 'utf-8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf-8');
}

function gitShow(path) {
  const result = spawnSync('git', ['show', `HEAD:${path}`], {
    cwd: repoRoot,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) return undefined;
  return result.stdout ?? '';
}

function introducedFindings(after, before) {
  const counts = new Map();
  for (const message of before) {
    counts.set(message, (counts.get(message) ?? 0) + 1);
  }
  const introduced = [];
  for (const message of after) {
    const left = counts.get(message) ?? 0;
    if (left > 0) {
      counts.set(message, left - 1);
      continue;
    }
    introduced.push(message);
  }
  return introduced;
}

const state = loadState();
let fileState = state[relativePath];
if (!fileState) {
  const head = gitShow(relativePath);
  fileState = {
    prev: head !== undefined ? await errorsIn(normalise(head)) : [],
    used: 0,
    cap: false,
  };
  state[relativePath] = fileState;
}

const current = normalise(readFileSync(absolute, 'utf-8'));
const afterFindings = await errorsIn(current);

const allNew = introducedFindings(afterFindings, fileState.prev);
const budget = fileState.cap ? 0 : CAP - fileState.used;
let toReport = allNew;
let capHit = false;
if (allNew.length > budget) {
  toReport = allNew.slice(0, Math.max(0, budget));
  capHit = true;
  fileState.cap = true;
}

if (toReport.length > 0 || capHit) {
  const lines = [];
  if (toReport.length > 0) {
    lines.push('This edit introduced ESLint errors:');
    lines.push(...toReport);
  }
  const remaining = allNew.length - toReport.length;
  if (capHit && remaining > 0) {
    lines.push(`  ${remaining} more finding(s) not shown (cap hit). ${CAP_MARKER}:${relativePath}`);
  } else if (capHit) {
    lines.push(`  No new reports for this file (cap already hit). ${CAP_MARKER}:${relativePath}`);
  }
  process.stderr.write(lines.join('\n') + '\n');
}

fileState.used += toReport.length;
fileState.prev = afterFindings;

saveState(state);

process.exit(toReport.length > 0 ? 2 : 0);
