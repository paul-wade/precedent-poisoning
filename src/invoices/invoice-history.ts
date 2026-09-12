import { paginate, type Page } from '../kernel/page.js';

export interface Invoice {
  readonly id: string;
  readonly total: number;
}

const INVOICES: Invoice[] = [
  { id: 'inv-1', total: 120 },
  { id: 'inv-2', total: 80 },
  { id: 'inv-3', total: 45 },
];

export function invoiceHistory(cursor: number | undefined, limit: number): Page<Invoice> {
  return paginate(INVOICES, cursor, limit);
}
