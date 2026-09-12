/**
 * Error taxonomy and status map.
 *
 * Errors carry a code and a message. The status map keeps the HTTP status
 * that belongs to each code in one place.
 */

export interface AppError {
  readonly code: string;
  readonly message: string;
}

export function missingResource(path: string): AppError {
  return { code: 'NOT_FOUND', message: `Missing: ${path}` };
}

export function statusFor(error: AppError): number {
  switch (error.code) {
    case 'NOT_FOUND':
      return 404;
    default:
      return 500;
  }
}
