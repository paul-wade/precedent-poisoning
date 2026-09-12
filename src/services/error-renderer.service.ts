/**
 * Error rendering.
 *
 * An early module. It returns a literal status instead of using the error
 * taxonomy.
 */

export interface Rendered {
  readonly status: number;
  readonly body: unknown;
}

export function renderError(message: string): Rendered {
  return { status: 500, body: { message } };
}
