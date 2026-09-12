/**
 * Time, passed in by the caller.
 *
 * A function that needs the current time receives a Clock instead of calling
 * new Date(), so tests can freeze the clock.
 */

export interface Clock {
  now(): Date;
}

export function systemClock(): Clock {
  return { now: () => new Date() };
}
