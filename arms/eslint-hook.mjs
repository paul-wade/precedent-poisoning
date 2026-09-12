#!/usr/bin/env node
/**
 * A PreToolUse gate over ESLint.
 *
 * PreToolUse fires *before* the write exists, so the file on disk is still the
 * pre-edit version. Linting that path would check the wrong content and could
 * never block anything — a post-write check wearing a pre-write hat. This
 * applies the proposed edit in memory and lints the result.
 *
 * `lintText(content, { filePath })` is what makes that possible with
 * type-aware rules: it lints a string as though it were at a path the project
 * already covers. Writing the content to a temp file instead does not work —
 * a temp file is outside the project, so ESLint answers "File ignored because
 * outside of base path" and the gate silently allows everything.
 *
 * Exit 2 denies the call and shows stderr to the agent. Any other exit allows
 * it, which is why every failure path here is explicit: a hook that throws is
 * a hook that permits.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
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
const onDisk = existsSync(absolute) ? readFileSync(absolute, 'utf-8') : '';

/** The content this call would leave on disk, without writing it. */
function proposedContent() {
  if (tool === 'Write') return toolInput.content ?? '';

  // The wire sends \n; a checkout with autocrlf stores \r\n. Matching the
  // needle against an unnormalised haystack fails on every CRLF file, and a
  // failed match here means the gate allows the write.
  const normalise = (text) => text.replace(/\r\n/g, '\n');

  if (tool === 'Edit') {
    let current = normalise(onDisk);
    const from = normalise(toolInput.old_string ?? '');
    const to = normalise(toolInput.new_string ?? '');
    const at = current.indexOf(from);
    if (from === '' || at === -1) return undefined;
    return current.slice(0, at) + to + current.slice(at + from.length);
  }

  if (tool === 'MultiEdit') {
    let current = normalise(onDisk);
    for (const edit of toolInput.edits ?? []) {
      const from = normalise(edit.old_string ?? '');
      const to = normalise(edit.new_string ?? '');
      const at = current.indexOf(from);
      if (from === '' || at === -1) return undefined;
      current = current.slice(0, at) + to + current.slice(at + from.length);
    }
    return current;
  }

  return undefined;
}

const proposed = proposedContent();
if (proposed === undefined) process.exit(0);

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

/**
 * Lint content destined for a path that does not exist yet.
 *
 * `lintText` alone is not enough for a file the project has never seen: the
 * type-aware service cannot build a program for a path with nothing behind it,
 * and answers with `"<path> was not found by the project service"` instead of
 * the rules' findings. That parse error is itself an error, so it appears in
 * the before count and the after count alike and cancels out — the gate then
 * allows every new file, which is five of this harness's eight fixtures and
 * was true of every run before this comment existed.
 *
 * So the content is put on disk exactly where it would land, linted through
 * the repository's own configuration, and removed again. The alternative -
 * restating the rules here without type information - is a second copy of the
 * rule set free to drift from the first.
 */
const errorsInNewFile = async (content) => {
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, 'utf-8');
  try {
    return await errorsIn(content);
  } finally {
    rmSync(absolute, { force: true });
  }
};

const existedBefore = existsSync(absolute);
const before = existedBefore ? await errorsIn(onDisk) : [];
const after = existedBefore ? await errorsIn(proposed) : await errorsInNewFile(proposed);

if (after.length <= before.length) process.exit(0);

process.stderr.write(
  ['This change would introduce ESLint errors:', ...after.slice(before.length), ''].join('\n'),
);
process.exit(2);
