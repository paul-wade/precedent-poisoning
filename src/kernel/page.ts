/**
 * Paging helpers.
 *
 * Lists are paged by cursor, not by offset, so adding an item earlier in the
 * list does not invalidate a cursor.
 */

export interface Page<T> {
  readonly items: readonly T[];
  readonly next?: number | undefined;
}

export function paginate<T>(
  items: readonly T[],
  cursor: number | undefined,
  limit: number,
): Page<T> {
  const start = cursor ?? 0;
  const end = start + limit;
  return {
    items: items.slice(start, end),
    next: end < items.length ? end : undefined,
  };
}
