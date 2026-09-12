/**
 * Reading an environment variable, the way this codebase does it now.
 *
 * A variable that is absent is a configuration error, not an empty string, so
 * it is reported here rather than surfacing later as a confusing failure.
 */

export function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is required but was not set`);
  }
  return value;
}

export function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

export function numeric(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number, got ${JSON.stringify(raw)}`);
  }
  return parsed;
}
