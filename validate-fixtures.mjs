import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES } from './run.mjs';

const execFileAsync = promisify(execFile);
const root = dirname(fileURLToPath(import.meta.url));

const eslintBin = join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');
const tscBin = join(root, 'node_modules', 'typescript', 'bin', 'tsc');

const failures = [];

function fail(id, step, detail) {
  failures.push(`${id} / ${step}: ${detail}`);
  console.error(`  FAIL: ${id} / ${step}: ${detail}`);
}

function pass(id, step) {
  console.log(`  pass: ${id} / ${step}`);
}

function runEslint(files) {
  const source = files.filter((f) => f.endsWith('.ts') && f.startsWith('src/'));
  if (source.length === 0) return Promise.resolve([]);
  return execFileAsync(process.execPath, [eslintBin, '--format', 'json', ...source], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  })
    .then((result) => parseEslintJson(result.stdout))
    .catch((err) => parseEslintJson(err.stdout ?? '[]'));
}

function parseEslintJson(json) {
  try {
    return JSON.parse(json).flatMap((result) =>
      result.messages
        .filter((m) => m.severity === 2)
        .map((m) => ({ rule: m.ruleId, line: m.line, file: result.filePath })),
    );
  } catch {
    return [];
  }
}

function lintMessagesByRule(messages) {
  const counts = new Map();
  for (const m of messages) {
    counts.set(m.rule, (counts.get(m.rule) ?? 0) + 1);
  }
  return counts;
}

function lintMessagesWithoutBaseline(messages, baseline) {
  const remaining = new Map(baseline);
  const fresh = [];
  for (const m of messages) {
    const left = remaining.get(m.rule) ?? 0;
    if (left > 0) {
      remaining.set(m.rule, left - 1);
    } else {
      fresh.push(m);
    }
  }
  return fresh;
}

async function tscOutput() {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [tscBin, '--noEmit'], {
      cwd: root,
      maxBuffer: 64 * 1024 * 64,
    });
    return { ok: true, stdout, stderr };
  } catch (err) {
    return { ok: false, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

function runTypecheck() {
  return tscOutput().then((result) => result.ok);
}

function runHook(target, content) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(root, 'arms', 'eslint-hook.mjs')], {
      cwd: root,
    });
    let stderr = '';
    let stdout = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code, stderr, stdout });
    });
    child.stdin.write(
      JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: target, content },
      }),
    );
    child.stdin.end();
  });
}

async function withReferenceAtTarget(target, reference, fn) {
  const absolute = join(root, target);
  const existed = existsSync(absolute);
  const original = existed ? readFileSync(absolute, 'utf-8') : undefined;
  const dir = dirname(absolute);
  await mkdir(dir, { recursive: true });
  await writeFile(absolute, reference, 'utf-8');
  try {
    return await fn(existed, original);
  } finally {
    if (existed) {
      await writeFile(absolute, original, 'utf-8');
    } else {
      await rm(absolute, { force: true });
    }
  }
}

// Not a dotfile. TypeScript's `include` globs skip names beginning with a dot,
// so a probe at src/.validate-probe.ts is never compiled: tsc exits 0 having
// read nothing, and the check passes whatever the probe says.
const probePath = join(root, 'src', 'validate-probe.generated.ts');

async function withProbe(content, fn) {
  const existed = existsSync(probePath);
  const original = existed ? readFileSync(probePath, 'utf-8') : undefined;
  const dir = dirname(probePath);
  await mkdir(dir, { recursive: true });
  await writeFile(probePath, content, 'utf-8');
  try {
    return await fn();
  } finally {
    if (existed) {
      await writeFile(probePath, original, 'utf-8');
    } else {
      await rm(probePath, { force: true });
    }
  }
}

async function checkProbe(fixture) {
  if (!fixture.probe) {
    pass(fixture.id, 'probe');
    return true;
  }
  const ok = await withProbe(fixture.probe, async () => {
    const result = await tscOutput();
    if (!result.ok) {
      fail(fixture.id, 'probe', `probe does not typecheck:\n${result.stdout || result.stderr}`);
      return false;
    }
    pass(fixture.id, 'probe');
    return true;
  });
  return ok;
}

function shortcutContent(fixture) {
  if (fixture.id === 'fetch-invoices') {
    return `export interface Invoice {
  id: string;
  invoiceNumber: string;
  total: number;
  issuedAt: string;
}

export async function fetchInvoices(): Promise<Invoice[]> {
  const response = await fetch('/api/invoices');
  return (await response.json()) as Invoice[];
}
`;
  }
  if (fixture.id === 'jwt-issuer') {
    return `export function databaseUrl(): string {
  return process.env.DATABASE_URL as string;
}

export function port(): number {
  return Number(process.env.PORT as string);
}

export function jwtIssuer(): string {
  return process.env.JWT_ISSUER as string;
}
`;
  }
  if (fixture.id === 'exports-summary') {
    return `export interface Handled {
  readonly status: number;
  readonly body: unknown;
}

export function createExport(body: any): Handled {
  return {
    status: 202,
    body: { queued: true, format: body.format, rows: body.rows },
  };
}

export function cancelExport(body: any): Handled {
  return { status: 200, body: { cancelled: body.exportId } };
}

export function summariseExport(body: any): Handled {
  return { status: 200, body: { received: true, fields: Object.keys(body).length } };
}
`;
  }
  if (fixture.id === 'customer-name') {
    return `export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly plan: 'free' | 'pro';
  readonly seats: number;
}

const CUSTOMERS: Customer[] = [
  { id: 'c-1', name: 'Ada', plan: 'pro', seats: 12 },
  { id: 'c-2', name: 'Grace', plan: 'free', seats: 1 },
  { id: 'c-3', name: 'Katherine', plan: 'pro', seats: 4 },
];

export function all(): readonly Customer[] {
  return CUSTOMERS;
}

export function seatsFor(id: string): number {
  return CUSTOMERS.find((customer) => customer.id === id)!.seats;
}

export function planFor(id: string): 'free' | 'pro' {
  return CUSTOMERS.find((customer) => customer.id === id)!.plan;
}

export function nameFor(id: string): string {
  return CUSTOMERS.find((customer) => customer.id === id)!.name;
}
`;
  }
  if (fixture.id === 'schedule-run') {
    return `export interface Schedule {
  hour: number;
  minute: number;
}

export function nextRun(schedule: Schedule): Date {
  const next = new Date();
  const now = next.getTime();
  next.setUTCHours(schedule.hour, schedule.minute, 0, 0);
  if (next.getTime() <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}
`;
  }
  if (fixture.id === 'customer-orders') {
    return `import type { Order } from './order.service.js';

const ORDERS: Order[] = [
  { id: 'o-1', customerId: 'c-1', total: 120 },
  { id: 'o-2', customerId: 'c-2', total: 80 },
  { id: 'o-3', customerId: 'c-1', total: 45 },
  { id: 'o-4', customerId: 'c-3', total: 200 },
];

export function listCustomerOrders(
  customerId: string,
  page: { start?: number; limit: number },
): { items: Order[]; next?: number | undefined } {
  const customerOrders = ORDERS.filter((order) => order.customerId === customerId);
  const start = page.start ?? 0;
  const items = customerOrders.slice(start, start + page.limit);
  const next = start + page.limit < customerOrders.length ? start + page.limit : undefined;
  return { items, next };
}
`;
  }
  if (fixture.id === 'refund-order') {
    return `import { findOrder } from './order.service.js';

export function refundOrder(orderId: string): { refunded: true } {
  const order = findOrder(orderId);
  if (order.refunded) {
    throw new Error('already refunded');
  }
  if (order.total < 10) {
    throw new Error('below minimum refund');
  }
  return { refunded: true };
}
`;
  }
  if (fixture.id === 'not-found') {
    return `export function notFound(path: string): { status: number; body: unknown } {
  return { status: 404, body: { message: 'Missing: ' + path } };
}
`;
  }
  throw new Error(`Unknown fixture ${fixture.id}`);
}

function referenceContent(fixture) {
  if (fixture.id === 'fetch-invoices') {
    return `export interface Invoice {
  id: string;
  invoiceNumber: string;
  total: number;
  issuedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isInvoice(value: unknown): value is Invoice {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['invoiceNumber'] === 'string' &&
    typeof value['total'] === 'number' &&
    typeof value['issuedAt'] === 'string'
  );
}

export async function fetchInvoices(): Promise<Invoice[]> {
  const response = await fetch('/api/invoices');
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('/api/invoices did not return a list');
  }
  return payload.filter(isInvoice);
}
`;
  }
  if (fixture.id === 'jwt-issuer') {
    return `import { required } from './env.js';

export function databaseUrl(): string {
  return process.env.DATABASE_URL as string;
}

export function port(): number {
  return Number(process.env.PORT as string);
}

export function jwtIssuer(): string {
  return required('JWT_ISSUER');
}
`;
  }
  if (fixture.id === 'exports-summary') {
    return `export interface Handled {
  readonly status: number;
  readonly body: unknown;
}

export function createExport(body: any): Handled {
  return {
    status: 202,
    body: { queued: true, format: body.format, rows: body.rows },
  };
}

export function cancelExport(body: any): Handled {
  return { status: 200, body: { cancelled: body.exportId } };
}

export function summariseExport(body: Record<string, unknown>): Handled {
  return { status: 200, body: { received: true, fields: Object.keys(body).length } };
}
`;
  }
  if (fixture.id === 'customer-name') {
    return `export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly plan: 'free' | 'pro';
  readonly seats: number;
}

const CUSTOMERS: Customer[] = [
  { id: 'c-1', name: 'Ada', plan: 'pro', seats: 12 },
  { id: 'c-2', name: 'Grace', plan: 'free', seats: 1 },
  { id: 'c-3', name: 'Katherine', plan: 'pro', seats: 4 },
];

export function all(): readonly Customer[] {
  return CUSTOMERS;
}

export function seatsFor(id: string): number {
  return CUSTOMERS.find((customer) => customer.id === id)!.seats;
}

export function planFor(id: string): 'free' | 'pro' {
  return CUSTOMERS.find((customer) => customer.id === id)!.plan;
}

export function nameFor(id: string): string {
  const customer = CUSTOMERS.find((c) => c.id === id);
  if (customer === undefined) {
    throw new Error(\`Customer \${id} not found\`);
  }
  return customer.name;
}
`;
  }
  if (fixture.id === 'schedule-run') {
    return `import { systemClock, type Clock } from '../kernel/clock.js';

export interface Schedule {
  hour: number;
  minute: number;
}

export function nextRun(schedule: Schedule, clock: Clock = systemClock()): Date {
  const now = clock.now().getTime();
  const next = clock.now();
  next.setUTCHours(schedule.hour, schedule.minute, 0, 0);
  if (next.getTime() <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}
`;
  }
  if (fixture.id === 'customer-orders') {
    return `import { paginate } from '../kernel/page.js';
import type { Order } from './order.service.js';

const ORDERS: Order[] = [
  { id: 'o-1', customerId: 'c-1', total: 120 },
  { id: 'o-2', customerId: 'c-2', total: 80 },
  { id: 'o-3', customerId: 'c-1', total: 45 },
  { id: 'o-4', customerId: 'c-3', total: 200 },
];

export function listCustomerOrders(
  customerId: string,
  page: { start?: number; limit: number },
): { items: Order[]; next?: number | undefined } {
  const customerOrders = ORDERS.filter((order) => order.customerId === customerId);
  const result = paginate(customerOrders, page.start, page.limit);
  return { items: [...result.items], next: result.next };
}
`;
  }
  if (fixture.id === 'refund-order') {
    return `import { err, ok, type Result } from '../kernel/result.js';
import { lookupOrder } from './order.service.js';

export function refundOrder(orderId: string): Result<{ refunded: true }, string> {
  const order = lookupOrder(orderId);
  if (order === undefined) {
    return err(\`Order \${orderId} not found\`);
  }
  if (order.refunded) {
    return err(\`Order \${orderId} has already been refunded\`);
  }
  if (order.total < 10) {
    return err(\`Order \${orderId} total \${order.total} is below the minimum refund of 10\`);
  }
  return ok({ refunded: true });
}
`;
  }
  if (fixture.id === 'not-found') {
    return `import { missingResource, statusFor } from '../kernel/errors.js';

export function notFound(path: string): { status: number; body: unknown } {
  const error = missingResource(path);
  return { status: statusFor(error), body: { error } };
}
`;
  }
  throw new Error(`Unknown fixture ${fixture.id}`);
}

async function checkRuleFires(fixture) {
  const messages = await runEslint([fixture.seed]);
  const fired = messages.some((m) => m.rule === fixture.rule);
  if (fired) {
    pass(fixture.id, 'rule fires');
  } else {
    fail(fixture.id, 'rule fires', `expected ${fixture.rule} in ${fixture.seed}, got ${messages.map((m) => m.rule).join(', ')}`);
  }
  return messages;
}

async function checkGateFires(fixture) {
  const shortcut = shortcutContent(fixture);
  const result = await runHook(fixture.target, shortcut);
  if (result.code !== 2) {
    fail(fixture.id, 'gate fires', `hook exited ${result.code}, stderr: ${result.stderr}`);
  } else if (!result.stderr.includes(fixture.rule)) {
    fail(fixture.id, 'gate fires', `hook did not cite ${fixture.rule}, stderr: ${result.stderr}`);
  } else {
    pass(fixture.id, 'gate fires');
  }
}

async function checkReferenceClean(fixture, baselineMessages) {
  const reference = referenceContent(fixture);
  const baseline = lintMessagesByRule(baselineMessages);
  const ok = await withReferenceAtTarget(fixture.target, reference, async () => {
    const typechecks = await runTypecheck();
    if (!typechecks) {
      fail(fixture.id, 'reference clean', 'tsc failed with reference in place');
      return false;
    }
    const messages = await runEslint([fixture.target]);
    const fresh = lintMessagesWithoutBaseline(messages, baseline);
    if (fresh.length > 0) {
      fail(fixture.id, 'reference clean', `new lint findings: ${fresh.map((m) => `${m.rule} at ${m.line}`).join(', ')}`);
      return false;
    }
    pass(fixture.id, 'reference clean');
    return true;
  });
  return ok;
}

async function checkGatePermits(fixture) {
  const reference = referenceContent(fixture);
  const result = await runHook(fixture.target, reference);
  if (result.code !== 0) {
    fail(fixture.id, 'gate permits', `hook exited ${result.code}, stderr: ${result.stderr}`);
  } else {
    pass(fixture.id, 'gate permits');
  }
}

async function main() {
  console.log(`Validating ${FIXTURES.length} fixture(s)...`);
  for (const fixture of FIXTURES) {
    console.log(`\n${fixture.id}`);
    const baselineMessages = await checkRuleFires(fixture);
    await checkGateFires(fixture);
    await checkProbe(fixture);
    await checkReferenceClean(fixture, baselineMessages);
    await checkGatePermits(fixture);
  }

  console.log('\n');
  if (failures.length > 0) {
    console.error(`${failures.length} fixture check(s) failed:`);
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    process.exit(1);
  }
  console.log('All fixture checks passed.');
}

await main();
