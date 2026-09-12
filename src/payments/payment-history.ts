import { paginate, type Page } from '../kernel/page.js';

export interface Payment {
  readonly id: string;
  readonly amount: number;
}

const PAYMENTS: Payment[] = [
  { id: 'p-1', amount: 120 },
  { id: 'p-2', amount: 80 },
  { id: 'p-3', amount: 45 },
];

export function paymentHistory(cursor: number | undefined, limit: number): Page<Payment> {
  return paginate(PAYMENTS, cursor, limit);
}
