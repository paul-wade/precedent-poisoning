import type { Clock } from '../kernel/clock.js';

export interface Invoice {
  readonly id: string;
  readonly total: number;
  readonly dueAt: Date;
}

export function isOverdue(invoice: Invoice, clock: Clock): boolean {
  return invoice.dueAt < clock.now();
}
