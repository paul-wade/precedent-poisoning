/**
 * Customers, fetched from the API.
 *
 * The current shape: the response is checked before it is used, so a change at
 * the other end surfaces here rather than three call sites later.
 */

export interface CustomerSummary {
  id: string;
  name: string;
  seats: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCustomerSummary(value: unknown): value is CustomerSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['name'] === 'string' &&
    typeof value['seats'] === 'number'
  );
}

export async function fetchCustomers(): Promise<CustomerSummary[]> {
  const response = await fetch('/api/customers');
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error('/api/customers did not return a list');
  }
  return payload.filter(isCustomerSummary);
}
