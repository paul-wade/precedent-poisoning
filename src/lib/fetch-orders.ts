/**
 * Orders, fetched from the API.
 *
 * Written before the response schemas existed. The shape is asserted rather
 * than checked.
 */

export interface Order {
  id: string;
  reference: string;
  total: number;
  placedAt: string;
}

export async function fetchOrders(): Promise<Order[]> {
  const response = await fetch('/api/orders');
  return (await response.json()) as Order[];
}
