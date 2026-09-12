import type { Clock } from '../kernel/clock.js';
import { err, ok, type Result } from '../kernel/result.js';

export interface Payment {
  readonly id: string;
  readonly amount: number;
  readonly processedAt: Date;
}

export function charge(amount: number): Result<{ charged: true }, string> {
  if (amount <= 0) {
    return err('amount must be positive');
  }
  return ok({ charged: true });
}

export function isExpired(payment: Payment, clock: Clock): boolean {
  return payment.processedAt < clock.now();
}
