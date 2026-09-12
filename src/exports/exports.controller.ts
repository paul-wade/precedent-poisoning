/**
 * Export endpoints.
 *
 * The request bodies here were never typed. The handler reads what it needs
 * and trusts the caller.
 */

export interface Handled {
  readonly status: number;
  readonly body: unknown;
}

export function createExport(body: any): Handled {
  return {
    status: 202,
    body: { queued: true, format: body.format, rows: body.rows },
  };
}

export function cancelExport(body: any): Handled {
  return { status: 200, body: { cancelled: body.exportId } };
}
