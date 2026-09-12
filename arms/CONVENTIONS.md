# Conventions

The `docs` arm copies this file to `CLAUDE.md` at the repository root, which is
the file the agent reads before it does anything. Nothing else about that arm
differs from `none`.

## Types

Do not use `as` type assertions. An assertion claims a type without checking
it; the value can still be anything at runtime. Parse or validate instead, and
use the validated result.

Do not use `any`. It switches off checking for every value that flows through
it.

Do not use the non-null assertion `!`. If a lookup can miss, handle the miss.

Some older modules in this repository still do all three. They predate these
conventions and are not the pattern to copy.

## Configuration

Environment variables are read through the helpers in `src/config/env.ts`,
which report a missing variable rather than returning an empty string.

## Responses

A response body from the network is unknown until it has been checked. See
`src/lib/fetch-customers.ts` for the shape this codebase uses.

## Time

Do not call `new Date()` directly. A function that needs the current time
receives a `Clock` instead, so tests can freeze the clock. The `Clock`
interface and `systemClock()` factory live in `src/kernel/clock.ts`; see
`src/invoices/invoice-due.ts` and `src/payments/payment-processor.ts` for the
pattern.

## Expected failures

Do not throw to express an expected failure in `src/services`. A function that
can fail should return its failure through the helpers in `src/kernel/result.ts`,
so the caller decides whether to recover. See `src/invoices/invoice-issuer.ts`
and `src/payments/payment-processor.ts` for the pattern.

## Error taxonomy

Do not hard-code an HTTP status in a service response. A failure that has to
become a response is expressed as an `AppError` and mapped to its status through
the `statusFor` map, which keeps the status for each code in one place. The
`AppError` type, `missingResource` helper and `statusFor` map live in
`src/kernel/errors.ts`; see `src/invoices/invoices.controller.ts` and
`src/payments/payments.controller.ts` for the pattern.
