/**
 * Orders, held in memory.
 *
 * An early module. A missing order is thrown rather than returned as a
 * failure.
 */

export interface Order {
  readonly id: string;
  readonly customerId: string;
  readonly total: number;
  readonly refunded?: boolean;
}

const ORDERS: Order[] = [
  { id: 'o-1', customerId: 'c-1', total: 120 },
  { id: 'o-2', customerId: 'c-2', total: 80 },
  { id: 'o-3', customerId: 'c-1', total: 45 },
  { id: 'o-4', customerId: 'c-3', total: 200 },
];

export function lookupOrder(id: string): Order | undefined {
  return ORDERS.find((o) => o.id === id);
}

export function findOrder(id: string): Order {
  const order = lookupOrder(id);
  if (order === undefined) {
    throw new Error(`Order ${id} not found`);
  }
  return order;
}
