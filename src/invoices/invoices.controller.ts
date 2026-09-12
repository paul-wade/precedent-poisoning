import { missingResource, statusFor } from '../kernel/errors.js';

export interface Handled {
  readonly status: number;
  readonly body: unknown;
}

export function invoiceMissing(path: string): Handled {
  const error = missingResource(path);
  return { status: statusFor(error), body: { error } };
}
