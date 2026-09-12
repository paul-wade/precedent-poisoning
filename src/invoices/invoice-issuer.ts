import { err, ok, type Result } from '../kernel/result.js';

export interface Invoice {
  readonly id: string;
  readonly total: number;
}

export function issueInvoice(total: number): Result<Invoice, string> {
  if (total < 0) {
    return err('total cannot be negative');
  }
  return ok({ id: `inv-${Math.random().toString(36).slice(2)}`, total });
}
