/**
 * Order list.
 *
 * An early module. It pages with Array.prototype.slice.
 */

import type { Order } from './order.service.js';

const ORDERS: Order[] = [
  { id: 'o-1', customerId: 'c-1', total: 120 },
  { id: 'o-2', customerId: 'c-2', total: 80 },
  { id: 'o-3', customerId: 'c-1', total: 45 },
  { id: 'o-4', customerId: 'c-3', total: 200 },
];

export function listOrders(offset: number, limit: number): Order[] {
  return ORDERS.slice(offset, offset + limit);
}
