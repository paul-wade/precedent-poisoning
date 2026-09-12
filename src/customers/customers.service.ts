/**
 * Customers, held in memory.
 *
 * Another early module. The lookups here assume the id exists, which was true
 * when the seed data was fixed and is not any more.
 */

export interface Customer {
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
